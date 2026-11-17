import { expect, it } from 'vitest';
import { GiftMetadataCache, hudFromRules } from '../src/core/hud';
import { bedrockPreset } from '../src/shared/bedrock-preset';
import { newRule } from '../src/shared/defaults';
import { ruleSchema } from '../src/shared/model';
import { defaultPerformance } from '../src/shared/performance';
import { simulatedEvent, simulationSchema, testRule } from '../src/providers/simulator';
import { ActionQueue } from '../src/core/queue';
import { RulesEngine } from '../src/core/rules-engine';
import { Logger } from '../src/core/logging';
import { EventBus } from '../src/core/events';

it('builds 20 editable rules, no fake IDs, no executable FUTURE, explicit windows and opt-in visibility', () => {
  const { rules, preset } = bedrockPreset([]);
  expect(rules).toHaveLength(20);
  rules.forEach((r) => expect(ruleSchema.parse(r)).toEqual(r));
  expect(rules.filter((r) => r.enabled)).toHaveLength(16);
  expect(
    rules
      .filter((r) => r.trigger.type === 'GIFT')
      .every((r) => r.trigger.type === 'GIFT' && r.trigger.giftId === ''),
  ).toBe(true);
  expect(
    rules
      .filter((r) => !r.enabled)
      .every((r) => !r.showInHud && r.actions.every((a) => a.type === 'LogMessage')),
  ).toBe(true);
  const hud = hudFromRules(rules, preset.id);
  expect(hud).toHaveLength(16);
  expect(hud[0]).toMatchObject({ label: 'ZOMBIE', quantity: 'Por unidad · hasta 5 (acciones variables)' });
  expect(JSON.stringify(hud)).not.toMatch(/summon|execute as|weather2|command|player|password/);
  expect(hud.every((i) => i.price === undefined)).toBe(true);
  expect(hudFromRules(rules, 'another')).toEqual([]);
});
it('legacy rules remain private; disabled, hidden and future rules are excluded; order follows metadata', () => {
  const old = newRule('p');
  expect(hudFromRules([old], 'p')).toEqual([]);
  const a = { ...old, id: 'a', publicLabel: 'public', showInHud: true, hudOrder: 2 };
  const b = { ...a, id: 'b', hudOrder: 1 };
  expect(
    hudFromRules(
      [a, b, { ...a, id: 'disabled', enabled: false }, { ...a, id: 'future', availability: 'REQUIRES_MOD' }],
      'p',
    ).map((r) => r.id),
  ).toEqual(['b', 'a']);
});
it('only observed TikTok metadata has a price; ambiguous names cannot invent a match', () => {
  const cache = new GiftMetadataCache();
  const e = simulatedEvent(
    simulationSchema.parse({ type: 'GIFT', giftId: '1', giftName: 'Rose', diamondCount: 5 }),
  );
  cache.observe(e);
  expect(cache.find(newRule('p'))).toBeUndefined();
  cache.observe({ ...e, source: 'tiktok' });
  expect(cache.find(newRule('p'))?.price).toBe(5);
  if (e.type !== 'GIFT') throw Error('gift');
  cache.observe({ ...e, source: 'tiktok', payload: { ...e.payload, giftId: '2' } });
  expect(cache.find(newRule('p'))).toBeUndefined();
  const rule = newRule('p');
  rule.trigger = { type: 'GIFT', giftName: 'wrong', giftId: '1', mode: 'STREAK_END' };
  expect(cache.find(rule)?.price).toBe(5);
});
it('HUD effective PER_ITEM limit follows explicit protection without rewriting rule', () => {
  const { rules, preset } = bedrockPreset([]);
  const protection = defaultPerformance();
  protection.enabled = true;
  protection.tiers.LIGHT.perItemCap = 2;
  expect(hudFromRules(rules, preset.id, new GiftMetadataCache(), protection)[0]?.quantity).toContain(
    'hasta 2',
  );
  expect(hudFromRules(rules, preset.id)[0]?.quantity).toContain('hasta 5');
});
it('FUTURE is blocked even by TEST; disabled legacy rules still support TEST', () => {
  const log = new Logger(),
    queue = new ActionQueue(log);
  queue.pause();
  const future = bedrockPreset([]).rules[19]!;
  const old = { ...newRule('p'), enabled: false };
  const engine = new RulesEngine(
    queue,
    () => [future, old],
    () => 'player',
    log,
  );
  engine.enabled = true;
  const bus = new EventBus((error) => {
    throw error;
  });
  bus.subscribe((e) => engine.process(e));
  testRule(bus, future);
  expect(queue.pendingCount).toBe(0);
  testRule(bus, old);
  expect(queue.pendingCount).toBe(1);
  queue.stop();
});
