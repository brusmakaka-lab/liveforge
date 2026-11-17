import type { Action, InternalLiveEvent, Rule } from '../shared/model';
import type { HudItem } from '../shared/overlay-studio';
import { safeGiftImage } from '../shared/media';
import type { PerformanceSettings } from '../shared/performance';

type GiftMetadata = { id: string; name: string; image?: string; price?: number };
const nameKey = (s: string) => s.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
export class GiftMetadataCache {
  private gifts = new Map<string, GiftMetadata>();
  observe(event: InternalLiveEvent): void {
    if (event.source !== 'tiktok' || event.type !== 'GIFT' || !event.payload.giftId) return;
    const gift = event.payload;
    this.gifts.set(gift.giftId, {
      id: gift.giftId,
      name: gift.giftName,
      image: safeGiftImage(gift.giftImage),
      price: gift.diamondCount,
    });
    while (this.gifts.size > 500) this.gifts.delete(this.gifts.keys().next().value!);
  }
  find(rule: Rule): GiftMetadata | undefined {
    if (rule.trigger.type !== 'GIFT') return;
    if (rule.trigger.giftId.trim()) return this.gifts.get(rule.trigger.giftId.trim());
    const name = nameKey(rule.trigger.giftName);
    const matches = [...this.gifts.values()].filter((g) => nameKey(g.name) === name);
    return matches.length === 1 ? matches[0] : undefined;
  }
}
function allActions(actions: Action[]): Action[] {
  return actions.flatMap((a) =>
    a.type === 'ActionPool' ? [a, ...a.entries.flatMap((e) => e.actions)] : [a],
  );
}
export function hudFromRules(
  rules: Rule[],
  activePreset: string,
  gifts = new GiftMetadataCache(),
  protection?: PerformanceSettings,
): HudItem[] {
  return rules
    .filter(
      (r) =>
        r.presetId === activePreset &&
        r.enabled &&
        (!r.availability || r.availability === 'READY') &&
        r.showInHud &&
        r.publicLabel?.trim(),
    )
    .sort((a, b) => (a.hudOrder ?? 0) - (b.hudOrder ?? 0) || a.id.localeCompare(b.id))
    .map((r) => {
      const t = r.trigger;
      const trigger =
        t.type === 'GIFT'
          ? t.giftName || `Gift #${t.giftId}`
          : t.type === 'CHAT_COMMAND'
            ? t.text
            : t.type === 'LIKE_BATCH'
              ? `Cada ${t.amount} likes`
              : t.type === 'TOTAL_LIKES_THRESHOLD'
                ? `${t.amount} likes`
                : t.type;
      const actions = allActions(r.actions);
      const alert = actions.find((a) => a.type === 'ShowAlert');
      const multiplied = actions.filter((a) => a.giftQuantity?.mode === 'PER_ITEM');
      const cap =
        protection?.enabled && r.performanceCost ? protection.tiers[r.performanceCost].perItemCap : 1000;
      const maximum = multiplied.length
        ? Math.max(...multiplied.map((a) => Math.min(a.giftQuantity!.maxExecutions, cap)))
        : 0;
      const gift = gifts.find(r);
      return {
        id: r.id,
        label: r.publicLabel!.trim(),
        trigger,
        impact: r.impact ?? 'NORMAL',
        quantity: multiplied.length
          ? `Por unidad · hasta ${maximum}${multiplied.length < actions.length ? ' (acciones variables)' : ''}`
          : '',
        icon: alert?.type === 'ShowAlert' ? alert.icon || '🎁' : '🎁',
        image: gift?.image,
        fallbackImage: alert?.type === 'ShowAlert' ? alert.customImage : undefined,
        price: gift?.price,
      };
    });
}
