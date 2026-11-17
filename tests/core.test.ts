import { describe, expect, it } from 'vitest';
import { Deduplicator, EventBus, GiftStreakTracker } from '../src/core/events';
import { ActionQueue } from '../src/core/queue';
import { Logger } from '../src/core/logging';
import { RulesEngine } from '../src/core/rules-engine';
import { renderTemplate, seededRandom, weightedChoice } from '../src/core/templates';
import { newRule } from '../src/shared/defaults';
import { ruleSchema, type Rule } from '../src/shared/model';
import { simulatedEvent, simulationSchema, testRule } from '../src/providers/simulator';
import { TikTokNormalizer } from '../src/providers/tiktok-normalizer';

function harness(rule?: Rule) {
  const log = new Logger();
  const queue = new ActionQueue(log, 20);
  queue.pause();
  const rules = [rule ?? { ...newRule('p'), trigger: { type: 'FOLLOW' as const } }];
  let now = Date.now();
  const engine = new RulesEngine(
    queue,
    () => rules,
    () => 'Ainztk58',
    log,
    () => now,
  );
  engine.enabled = true;
  const bus = new EventBus((error) => {
    throw error;
  });
  bus.subscribe((event) => engine.process(event));
  const emit = (input: Record<string, unknown>) => {
    const e = simulatedEvent(simulationSchema.parse(input));
    bus.publish(e);
    return e;
  };
  return {
    log,
    queue,
    rules,
    engine,
    bus,
    emit,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe('Rules engine', () => {
  it('matches followers and deduplicates the same event', () => {
    const h = harness();
    const e = h.emit({ type: 'FOLLOW' });
    h.bus.publish(e);
    expect(h.queue.pendingCount).toBe(1);
    expect(h.engine.session.eventsReceived).toBe(1);
  });
  it('runs 10K, 25K and 50K once per session, not again at 50001', () => {
    const h = harness();
    h.rules.splice(0);
    for (const amount of [10_000, 25_000, 50_000])
      h.rules.push({ ...newRule('p'), trigger: { type: 'TOTAL_LIKES_THRESHOLD', amount } });
    h.emit({ type: 'LIKE', totalLikes: 50_000 });
    h.emit({ type: 'LIKE', totalLikes: 50_001 });
    expect(h.queue.pendingCount).toBe(3);
    expect(h.engine.session.triggeredThresholds).toHaveLength(3);
    h.engine.startSession('tiktok');
    h.emit({ type: 'LIKE', totalLikes: 50_001 });
    expect(h.queue.pendingCount).toBe(6);
  });
  it('resets total baseline without retriggering from the previous reported total', () => {
    const h = harness({ ...newRule('p'), trigger: { type: 'TOTAL_LIKES_THRESHOLD', amount: 50_000 } });
    h.emit({ type: 'LIKE', totalLikes: 50_000 });
    h.engine.resetCounters();
    h.emit({ type: 'LIKE', totalLikes: 50_001 });
    expect(h.engine.session.totalLikes).toBe(1);
    expect(h.queue.pendingCount).toBe(1);
    h.emit({ type: 'LIKE', totalLikes: 100_000 });
    expect(h.queue.pendingCount).toBe(2);
  });
  it('retains batches across events and does not count total updates as new likes', () => {
    const h = harness({ ...newRule('p'), trigger: { type: 'LIKE_BATCH', amount: 500 } });
    h.emit({ type: 'LIKE', likeCount: 300, totalLikes: 50_000 });
    h.emit({ type: 'LIKE', likeCount: 750, totalLikes: 50_750 });
    expect(h.queue.pendingCount).toBe(2);
    h.emit({ type: 'LIKE', likeCount: 450 });
    expect(h.queue.pendingCount).toBe(3);
  });
  it('default IGNORE applies cooldown without consuming extra queue slots', () => {
    const rule = {
      ...newRule('p'),
      trigger: { type: 'FOLLOW' as const },
      cooldown: { duration: 30_000, policy: 'IGNORE' as const },
    };
    const h = harness(rule);
    h.emit({ type: 'FOLLOW' });
    h.emit({ type: 'FOLLOW' });
    expect(h.queue.pendingCount).toBe(1);
    h.advance(30_001);
    h.emit({ type: 'FOLLOW' });
    expect(h.queue.pendingCount).toBe(2);
  });
  it('QUEUE reserves separated time slots and REPLACE replaces pending work', () => {
    const h = harness({
      ...newRule('p'),
      trigger: { type: 'FOLLOW' },
      cooldown: { duration: 1000, policy: 'QUEUE' },
    });
    h.emit({ type: 'FOLLOW' });
    h.emit({ type: 'FOLLOW' });
    h.emit({ type: 'FOLLOW' });
    const jobs = h.queue.snapshot;
    expect(jobs[1]!.notBefore - jobs[0]!.notBefore).toBe(1000);
    expect(jobs[2]!.notBefore - jobs[1]!.notBefore).toBe(1000);
    h.rules[0]!.cooldown.policy = 'REPLACE';
    h.emit({ type: 'FOLLOW', username: 'last' });
    expect(h.queue.pendingCount).toBe(1);
    expect(h.queue.snapshot.at(-1)!.event.user.username).toBe('last');
  });
  it('STREAK_END triggers only final quantity; EACH_GIFT emits quantity delta', () => {
    const h = harness(newRule('p'));
    const first = h.rules[0]!;
    const each = {
      ...first,
      id: 'each',
      trigger: { type: 'GIFT' as const, giftId: '', giftName: 'Rose', mode: 'EACH_GIFT' as const },
    };
    h.rules.push(each);
    h.emit({ type: 'GIFT', quantity: 1, repeatEnd: false, streakId: 's' });
    h.emit({ type: 'GIFT', quantity: 5, repeatEnd: false, streakId: 's' });
    expect(h.queue.pendingCount).toBe(5);
    h.emit({ type: 'GIFT', quantity: 5, repeatEnd: true, streakId: 's' });
    h.emit({ type: 'GIFT', quantity: 5, repeatEnd: true, streakId: 's' });
    expect(h.queue.pendingCount).toBe(6);
    expect(h.queue.snapshot.find((j) => j.ruleId === first.id)!.variables.giftCount).toBe(5);
  });
  it('matches gift id, conditions and non-streak gift quantities', () => {
    const rule = newRule('p');
    rule.trigger = { type: 'GIFT', giftId: '42', giftName: '', mode: 'STREAK_END' };
    rule.conditions = { minQuantity: 3, minCoins: 6, username: 'sender' };
    const h = harness(rule);
    h.emit({ type: 'GIFT', giftId: '42', username: 'other', quantity: 3, diamondCount: 2, streak: false });
    expect(h.queue.pendingCount).toBe(0);
    h.emit({ type: 'GIFT', giftId: '42', username: 'sender', quantity: 3, diamondCount: 2, streak: false });
    expect(h.queue.pendingCount).toBe(1);
  });
  it('chat only matches fixed configured rule actions', () => {
    const h = harness({ ...newRule('p'), trigger: { type: 'CHAT_COMMAND', text: '!boss', match: 'EXACT' } });
    h.emit({ type: 'CHAT', message: 'op attacker' });
    expect(h.queue.pendingCount).toBe(0);
    h.emit({ type: 'CHAT', message: '!boss' });
    expect(h.queue.snapshot[0]!.actions).toEqual(h.rules[0]!.actions);
  });
  it('STOP blocks tests and events while still observing totals', () => {
    const h = harness();
    h.emit({ type: 'FOLLOW' });
    h.engine.stop();
    h.emit({ type: 'FOLLOW' });
    h.emit({ type: 'LIKE', totalLikes: 500 });
    testRule(h.bus, h.rules[0]!);
    expect(h.queue.pendingCount).toBe(0);
    expect(h.engine.session.totalLikes).toBe(500);
    expect(h.queue.snapshot[0]!.status).toBe('CANCELLED');
  });
  it('manual TEST uses bus → engine → queue, ignores eligibility but preserves session thresholds', () => {
    const h = harness({
      ...newRule('p'),
      enabled: false,
      trigger: { type: 'TOTAL_LIKES_THRESHOLD', amount: 50_000 },
    });
    testRule(h.bus, h.rules[0]!);
    expect(h.queue.pendingCount).toBe(1);
    expect(h.engine.session.totalLikes).toBe(0);
    expect(h.engine.session.triggeredThresholds).toHaveLength(0);
    expect(h.queue.snapshot[0]!.variables.totalLikes).toBe(50_000);
  });
  it('validates malformed rules and queue capacity', () => {
    expect(() => ruleSchema.parse({})).toThrow();
    const h = harness();
    for (let i = 0; i < 25; i++) h.emit({ type: 'FOLLOW' });
    expect(h.queue.pendingCount).toBe(20);
  });
});
describe('deduplication and normalization', () => {
  it('expires and bounds dedup memory', () => {
    let now = 0;
    const d = new Deduplicator(100, 2, () => now);
    expect(d.accept('a')).toBe(true);
    expect(d.accept('a')).toBe(false);
    d.accept('b');
    d.accept('c');
    expect(d.size).toBe(2);
    now = 101;
    expect(d.accept('c')).toBe(true);
  });
  it('handles out of order counts and duplicate final tombstones', () => {
    const tracker = new GiftStreakTracker();
    const event = (n: number, end: boolean) =>
      simulatedEvent(simulationSchema.parse({ type: 'GIFT', quantity: n, repeatEnd: end, streakId: 'x' }));
    const a = event(5, false);
    if (a.type !== 'GIFT') throw new Error();
    expect(tracker.update(a).delta).toBe(5);
    expect(tracker.update({ ...a, payload: { ...a.payload, repeatCount: 2 } }).delta).toBe(0);
    expect(tracker.update({ ...a, payload: { ...a.payload, repeatEnd: true } }).final).toBe(5);
    expect(tracker.update(a).delta).toBe(0);
  });
  it('normalizes actual v2.5 nested gift and like fields', () => {
    const n = new TikTokNormalizer();
    const e = n.normalize('GIFT', {
      common: { msgId: '1' },
      user: { userId: 'u', uniqueId: 'juan' },
      giftId: '5655',
      groupId: 'group',
      gift: { type: 1, name: 'Rose', diamondCount: 1 },
      repeatCount: 5,
      repeatEnd: 1,
    });
    expect(e.type).toBe('GIFT');
    if (e.type === 'GIFT')
      expect(e.payload).toMatchObject({ streak: true, repeatEnd: true, giftName: 'Rose', repeatCount: 5 });
    const like = n.normalize('LIKE', { count: 4, total: '50000', user: { uniqueId: 'u' } });
    expect(like.payload).toEqual({ likeCount: 4, totalLikeCount: 50000 });
  });
  it('keeps gift phases distinct even if msgId is reused', () => {
    const n = new TikTokNormalizer();
    const raw = {
      common: { msgId: '1' },
      user: { uniqueId: 'u' },
      giftId: '1',
      groupId: 'g',
      gift: { type: 1 },
      repeatCount: 1,
      repeatEnd: 0,
    };
    expect(n.normalize('GIFT', raw).id).not.toBe(n.normalize('GIFT', { ...raw, repeatEnd: 1 }).id);
  });
  it('isolates subscriber errors and rejects invalid boundary input', () => {
    const errors: unknown[] = [];
    const b = new EventBus((e) => errors.push(e));
    let called = false;
    b.subscribe(() => {
      throw new Error('bad listener');
    });
    b.subscribe(() => {
      called = true;
    });
    b.publish(simulatedEvent(simulationSchema.parse({ type: 'FOLLOW' })));
    expect(called).toBe(true);
    expect(errors).toHaveLength(1);
    expect(() => b.publish({ type: 'GIFT' })).toThrow();
  });
});
describe('templates and pools', () => {
  it('renders fixed commands and strips a leading slash', () => {
    expect(
      renderTemplate('/execute as {{player}} at @s run say {{username}} {{giftCount}}', {
        player: 'Ainztk58',
        username: 'juan',
        giftCount: 5,
      }),
    ).toBe('execute as Ainztk58 at @s run say juan 5');
  });
  it('cannot inject selectors, syntax, newlines or extra tokens from user values', () => {
    const value = renderTemplate('say {{username}}', { username: '@a\n/kill @e {x:1}' });
    expect(value).not.toMatch(/@|\n|\/|\{|:/);
    expect(value.split(' ')).toHaveLength(2);
    expect(() => renderTemplate('say {{message}}', {})).toThrow();
    expect(() => renderTemplate('execute as {{player}}', { player: '@a' })).toThrow();
  });
  it('supports unicode display text without executable command interpolation', () => {
    expect(renderTemplate('Gracias {{nickname}}', { nickname: 'Ana ♥' }, 'text')).toBe('Gracias Ana ♥');
  });
  it('weighted pools have stable seeded output and configurable weights', () => {
    const entries = [
      { name: 'a', weight: 60 },
      { name: 'b', weight: 25 },
      { name: 'c', weight: 15 },
    ];
    const a = seededRandom('test');
    const b = seededRandom('test');
    expect(Array.from({ length: 100 }, () => weightedChoice(entries, a))).toEqual(
      Array.from({ length: 100 }, () => weightedChoice(entries, b)),
    );
    expect(weightedChoice(entries, () => 0.99).name).toBe('c');
    expect(() => weightedChoice([{ weight: 0 }])).toThrow();
  });
});
