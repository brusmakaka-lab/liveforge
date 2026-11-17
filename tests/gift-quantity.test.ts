import { afterEach, describe, expect, it } from 'vitest';
import { setTimeout as sleep } from 'node:timers/promises';
import { matchesGift, planGiftActions } from '../src/core/gift-actions';
import { ActionQueue } from '../src/core/queue';
import { RulesEngine } from '../src/core/rules-engine';
import { Logger } from '../src/core/logging';
import { newAction, newRule } from '../src/shared/defaults';
import { ruleSchema, type Rule } from '../src/shared/model';
import { simulatedEvent, simulationSchema, testRule } from '../src/providers/simulator';
import { TikTokNormalizer } from '../src/providers/tiktok-normalizer';
import { EventBus } from '../src/core/events';
const queues: ActionQueue[] = [];
afterEach(() => queues.splice(0).forEach((q) => q.stop()));
const event = (input: Record<string, unknown> = {}) =>
  simulatedEvent(simulationSchema.parse({ type: 'GIFT', giftName: 'Donut', quantity: 5, ...input }));
function setup(mode: 'ONCE' | 'PER_ITEM' = 'ONCE', maximum = 50, interval = 10) {
  const log = new Logger();
  const queue = new ActionQueue(log);
  queues.push(queue);
  const rule: Rule = {
    ...newRule('p'),
    trigger: { type: 'GIFT', giftId: '', giftName: 'Donut', mode: 'STREAK_END' },
    actions: [{ ...newAction(), giftQuantity: { mode, maxExecutions: maximum, interval } }],
  };
  const engine = new RulesEngine(
    queue,
    () => [rule],
    () => 'Ainztk58',
    log,
  );
  const calls: number[] = [];
  queue.register('MinecraftCommand', async () => {
    calls.push(Date.now());
  });
  engine.resume();
  return { queue, rule, engine, calls };
}
async function complete(h: ReturnType<typeof setup>) {
  await expect.poll(() => h.queue.snapshot.at(-1)?.status).toBe('COMPLETED');
}
describe('gift selection and quantity', () => {
  it.each(['simulator', 'tiktok'] as const)(
    'matches ID before name through %s event pipeline',
    async (source) => {
      const h = setup();
      h.rule.trigger = { type: 'GIFT', giftId: ' 42 ', giftName: 'Other', mode: 'STREAK_END' };
      const e =
        source === 'tiktok'
          ? new TikTokNormalizer().normalize('GIFT', {
              giftId: 42,
              gift: { type: 1, name: 'Donut' },
              repeatCount: 5,
              repeatEnd: 1,
              groupId: 'a',
            })
          : event({ giftId: '42' });
      h.engine.process(e);
      await complete(h);
      expect(h.calls).toHaveLength(1);
      h.engine.process(event({ giftId: '43', giftName: 'Other' }));
      await sleep(20);
      expect(h.calls).toHaveLength(1);
    },
  );
  it.each(['simulator', 'tiktok'] as const)('matches name reliably without ID through %s', async (source) => {
    const h = setup();
    h.rule.trigger = { type: 'GIFT', giftId: ' ', giftName: ' ＤＯＮＵＴ ', mode: 'STREAK_END' };
    h.engine.process(
      source === 'tiktok'
        ? new TikTokNormalizer().normalize('GIFT', {
            giftId: 11,
            gift: { name: 'Donut', type: 1 },
            repeatEnd: 1,
            repeatCount: 5,
          })
        : event(),
    );
    await complete(h);
    expect(h.calls).toHaveLength(1);
    h.engine.process(event({ giftName: 'Rose' }));
    await sleep(20);
    expect(h.calls).toHaveLength(1);
  });
  it('does not match empty names or translate gift names', () => {
    const e = event();
    if (e.type !== 'GIFT') throw Error();
    expect(
      matchesGift(
        { type: 'GIFT', giftId: '', giftName: ' ', mode: 'STREAK_END' },
        { ...e.payload, giftName: '' },
      ),
    ).toBe(false);
    expect(
      matchesGift(
        { type: 'GIFT', giftId: '', giftName: 'Rosa', mode: 'STREAK_END' },
        { ...e.payload, giftName: 'Rose' },
      ),
    ).toBe(false);
  });
  it('x5 ONCE executes once; old rules retain manual repeats', async () => {
    const h = setup();
    h.engine.process(event());
    await complete(h);
    expect(h.calls).toHaveLength(1);
    const old = { ...newAction(), repeatCount: 3 };
    expect(planGiftActions([old], 5)).toEqual([old]);
    expect(ruleSchema.parse(newRule('p')).actions[0]!.giftQuantity).toBeUndefined();
  });
  it('x5 PER_ITEM executes five with intervals', async () => {
    const h = setup('PER_ITEM', 50, 35);
    h.engine.process(event());
    await complete(h);
    expect(h.calls).toHaveLength(5);
    for (let i = 1; i < h.calls.length; i++) expect(h.calls[i]! - h.calls[i - 1]!).toBeGreaterThanOrEqual(30);
  });
  it('caps total executions including manual repeats and validates limits', async () => {
    const h = setup('PER_ITEM', 3);
    h.rule.actions[0]!.repeatCount = 10;
    h.engine.process(event());
    await complete(h);
    expect(h.calls).toHaveLength(3);
    h.rule.actions[0]!.giftQuantity!.maxExecutions = 1001;
    expect(ruleSchema.safeParse(h.rule).success).toBe(false);
  });
  it('STOP cancels pending repetitions and prevents new triggers', async () => {
    const h = setup('PER_ITEM', 50, 200);
    h.engine.process(event());
    await expect.poll(() => h.calls.length).toBe(1);
    h.engine.stop();
    await expect.poll(() => h.queue.snapshot[0]!.status).toBe('CANCELLED');
    h.engine.process(event());
    await sleep(220);
    expect(h.calls).toHaveLength(1);
  });
  it('only final x5 runs; duplicate final does not repeat, cooldown ignores next streak', async () => {
    const h = setup('PER_ITEM');
    h.rule.cooldown.duration = 30_000;
    for (const quantity of [1, 2, 5]) h.engine.process(event({ quantity, repeatEnd: false, streakId: 's' }));
    expect(h.queue.snapshot).toHaveLength(0);
    h.engine.process(event({ streakId: 's' }));
    await complete(h);
    h.engine.process(event({ streakId: 's' }));
    h.engine.process(event({ streakId: 'next' }));
    await sleep(20);
    expect(h.calls).toHaveLength(5);
    expect(h.queue.snapshot).toHaveLength(1);
  });
  it('EACH_GIFT does not square quantity with PER_ITEM', async () => {
    const h = setup('PER_ITEM');
    h.rule.trigger = { type: 'GIFT', giftId: '', giftName: 'Donut', mode: 'EACH_GIFT' };
    h.engine.process(event());
    await expect.poll(() => h.queue.completed).toBe(5);
    expect(h.calls).toHaveLength(5);
  });
  it('individual TEST uses matching synthetic gift and same quantity planner without consuming cooldown', async () => {
    const h = setup('PER_ITEM');
    h.rule.conditions.minQuantity = 5;
    const bus = new EventBus((e) => {
      throw e;
    });
    bus.subscribe((e) => h.engine.process(e));
    testRule(bus, h.rule);
    await complete(h);
    expect(h.calls).toHaveLength(5);
    expect(h.engine.cooldowns).toEqual({});
  });
  it('preserves priority on a quantity job', async () => {
    const h = setup('PER_ITEM');
    h.queue.pause();
    h.rule.priority = 'CRITICAL';
    h.engine.process(event());
    expect(h.queue.snapshot[0]!.priority).toBe('CRITICAL');
    h.queue.resume();
    await complete(h);
  });
});
