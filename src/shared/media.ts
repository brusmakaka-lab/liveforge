import type { InternalLiveEvent, Rule } from './model';

export type Impact = NonNullable<Rule['impact']>;
export const impactRank: Record<Impact, number> = { LOW: 0, NORMAL: 1, HIGH: 2, EPIC: 3 };
export interface AlertDetails {
  id: string;
  username: string;
  giftName: string;
  quantity: number;
  image?: string;
  customImage?: string;
  icon?: string;
  impact: Impact;
  activeStreak: boolean;
  progress?: boolean;
}
export interface AlertView extends AlertDetails {
  text: string;
  expiresAt: number;
  leaving: boolean;
}
export function safeGiftImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return;
  try {
    const url = new URL(value);
    const hosts = [
      'tiktokcdn.com',
      'tiktokcdn-us.com',
      'tiktokcdn-eu.com',
      'ibyteimg.com',
      'ibytedtos.com',
      'muscdn.com',
    ];
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    )
      return url.href;
  } catch {
    /* Missing/malformed image uses the local icon. */
  }
  return;
}
export function alertDetails(
  event: InternalLiveEvent,
  ruleId: string,
  actionId: string,
  impact: Impact = 'NORMAL',
): AlertDetails {
  const gift = event.type === 'GIFT' ? event.payload : undefined;
  return {
    id: JSON.stringify([
      event.source,
      ruleId,
      actionId,
      event.user.id,
      gift?.streak ? gift.streakId : event.id,
      gift?.giftId,
    ]),
    username: event.user.username,
    giftName: gift?.giftName ?? '',
    quantity: gift?.repeatCount ?? 1,
    image: safeGiftImage(gift?.giftImage),
    impact,
    activeStreak: Boolean(gift?.streak && !gift.repeatEnd),
  };
}
