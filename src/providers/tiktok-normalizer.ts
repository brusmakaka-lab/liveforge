import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eventSchema, type EventType, type InternalLiveEvent } from '../shared/model';
import { safeGiftImage } from '../shared/media';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown, fallback = ''): string =>
  value === undefined || value === null ? fallback : String(value);
const numeric = (value: unknown, fallback = 0): number =>
  value === undefined
    ? fallback
    : z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(value);
const usefulId = (value: unknown): string => (value && String(value) !== '0' ? String(value) : '');

/** The only module that knows TikTok payload field names. Unknown input validated here. */
export class TikTokNormalizer {
  private fallbackStreaks = new Map<string, { id: string; count: number; ended: boolean; time: number }>();
  normalize(type: EventType, input: unknown, retainRaw = false): InternalLiveEvent {
    const data = z.record(z.string(), z.unknown()).parse(input);
    const u = object(data.user);
    const common = object(data.common);
    const g = object(data.gift);
    const extended = object(data.extendedGiftInfo);
    const username = text(u.uniqueId || data.uniqueId || u.displayId, 'unknown');
    const user = {
      id: text(u.userId ?? u.id ?? data.userId, username),
      username,
      nickname: text(u.nickname ?? data.nickname, username),
      avatar: text((object(u.avatarThumb).urlList as unknown[] | undefined)?.[0]) || undefined,
    };
    const receivedAt = Date.now();
    const created = numeric(common.createTime, 0);
    const timestamp = created ? (created < 10_000_000_000 ? created * 1000 : created) : receivedAt;
    const messageId = usefulId(common.msgId ?? data.msgId);
    const baseId = messageId || createHash('sha256').update(JSON.stringify(data)).digest('hex');
    let id = `${type}:${baseId}`;
    let payload: unknown = {};
    if (type === 'LIKE')
      payload = {
        likeCount: numeric(data.count ?? data.likeCount),
        totalLikeCount:
          data.total !== undefined || data.totalLikeCount !== undefined
            ? numeric(data.total ?? data.totalLikeCount)
            : undefined,
      };
    if (type === 'CHAT') payload = { message: text(data.content ?? data.comment ?? data.message) };
    if (type === 'GIFT') {
      const giftId = text(data.giftId);
      const repeatCount = Math.max(1, numeric(data.repeatCount, 1));
      const repeatEnd = data.repeatEnd === true || data.repeatEnd === 1;
      const streak = numeric(g.type ?? data.giftType) === 1;
      let streakId = usefulId(data.groupId) || usefulId(data.orderId);
      if (!streakId) {
        const key = `${user.id}:${giftId}`;
        const previous = this.fallbackStreaks.get(key);
        // When groupId is unavailable, conservatively keep final tombstones for 10s.
        const fresh =
          !previous ||
          receivedAt - previous.time > (previous.ended ? 10_000 : 120_000) ||
          (previous.ended && !repeatEnd) ||
          (!previous.ended && repeatCount < previous.count && !repeatEnd);
        streakId = fresh ? randomUUID() : previous.id;
        this.fallbackStreaks.delete(key);
        this.fallbackStreaks.set(key, {
          id: streakId,
          count: repeatCount,
          ended: repeatEnd,
          time: receivedAt,
        });
        while (this.fallbackStreaks.size > 10_000)
          this.fallbackStreaks.delete(this.fallbackStreaks.keys().next().value!);
      }
      id += `:${repeatCount}:${repeatEnd}`;
      payload = {
        giftId,
        giftName: text(extended.name ?? g.name ?? data.giftName, giftId),
        giftImage: safeGiftImage(
          (object(g.image).urlList as unknown[] | undefined)?.[0] ??
            (object(g.icon).urlList as unknown[] | undefined)?.[0],
        ),
        repeatCount,
        repeatEnd,
        streak,
        streakId,
        diamondCount: numeric(
          extended.diamond_count ?? extended.diamondCount ?? g.diamondCount ?? data.diamondCount,
        ),
      };
    }
    // Raw is bounded and never forwarded into the rule jobs or persisted logs.
    const serialized = retainRaw ? JSON.stringify(data) : '';
    return eventSchema.parse({
      id,
      type,
      timestamp,
      source: 'tiktok',
      user,
      payload,
      raw: retainRaw ? serialized.slice(0, 16_384) : undefined,
    });
  }
}
