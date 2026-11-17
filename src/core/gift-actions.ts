import type { Action, InternalLiveEvent, Trigger } from '../shared/model';

const nameKey = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

export function matchesGift(
  trigger: Extract<Trigger, { type: 'GIFT' }>,
  payload: Extract<InternalLiveEvent, { type: 'GIFT' }>['payload'],
): boolean {
  const id = trigger.giftId.trim();
  if (id) return id === payload.giftId.trim();
  const name = nameKey(trigger.giftName);
  return Boolean(name) && name === nameKey(payload.giftName);
}

/** Resolve quantities once, before enqueue; the existing scheduler owns waits and cancellation. */
export function planGiftActions(actions: Action[], quantity: number, cap = 1000): Action[] {
  return actions.map((action) => {
    const perItem = action.giftQuantity?.mode === 'PER_ITEM';
    const planned = perItem
      ? {
          ...action,
          repeatCount: Math.min(cap, action.giftQuantity!.maxExecutions, action.repeatCount * quantity),
          intervalBetweenRepeats: action.giftQuantity!.interval,
        }
      : { ...action };
    if (planned.type === 'ActionPool') {
      // Pool repetitions consume quantity here; descendants receive a unit to avoid squaring it.
      planned.entries = planned.entries.map((entry) => ({
        ...entry,
        actions: planGiftActions(entry.actions, perItem ? 1 : quantity, cap) as typeof entry.actions,
      }));
    }
    return planned;
  });
}
