import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eventSchema, eventTypes, type InternalLiveEvent, type Rule } from '../shared/model';
import type { EventBus } from '../core/events';

export const simulationSchema = z.object({
  type: z.enum(eventTypes),
  username: z.string().min(1).max(200).default('testuser'),
  giftId: z.string().max(100).default('5655'),
  giftName: z.string().max(200).default('Rose'),
  quantity: z.number().int().min(1).max(100_000).default(5),
  likeCount: z.number().int().nonnegative().max(10_000_000).default(500),
  totalLikes: z.number().int().nonnegative().max(1_000_000_000).optional(),
  message: z.string().max(4000).default('!boss'),
  streak: z.boolean().default(true),
  repeatEnd: z.boolean().default(true),
  streakId: z.string().max(300).optional(),
  diamondCount: z.number().int().nonnegative().default(1),
});
export type Simulation = z.infer<typeof simulationSchema>;
export function simulatedEvent(input: Simulation, testRuleId?: string): InternalLiveEvent {
  const s = simulationSchema.parse(input);
  const id = randomUUID();
  const base = {
    id,
    source: 'simulator',
    timestamp: Date.now(),
    user: { id: s.username, username: s.username, nickname: s.username },
    testRuleId,
  };
  const payload =
    s.type === 'GIFT'
      ? {
          giftId: s.giftId,
          giftName: s.giftName,
          repeatCount: s.quantity,
          repeatEnd: s.repeatEnd,
          streak: s.streak,
          streakId: s.streakId || id,
          diamondCount: s.diamondCount,
        }
      : s.type === 'LIKE'
        ? { likeCount: s.likeCount, totalLikeCount: s.totalLikes }
        : s.type === 'CHAT'
          ? { message: s.message }
          : {};
  return eventSchema.parse({ ...base, type: s.type, payload });
}
export function testRule(bus: EventBus, rule: Rule): void {
  const t = rule.trigger;
  const type =
    t.type === 'LIKE_BATCH' || t.type === 'TOTAL_LIKES_THRESHOLD'
      ? 'LIKE'
      : t.type === 'CHAT_COMMAND'
        ? 'CHAT'
        : t.type;
  const input = simulationSchema.parse({
    type,
    username: rule.conditions.username || 'testuser',
    giftId: t.type === 'GIFT' ? t.giftId || '5655' : undefined,
    giftName: t.type === 'GIFT' ? t.giftName : undefined,
    quantity: Math.max(1, rule.conditions.minQuantity),
    likeCount: 'amount' in t ? t.amount : 1,
    totalLikes: 'amount' in t ? t.amount : undefined,
    message: t.type === 'CHAT_COMMAND' ? t.text : undefined,
  });
  bus.publish(simulatedEvent(input, rule.id));
}
