import { afterEach, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PerformanceGuard } from '../src/core/performance-guard';
import { ActionQueue } from '../src/core/queue';
import { RulesEngine } from '../src/core/rules-engine';
import { Logger } from '../src/core/logging';
import { newAction, newRule } from '../src/shared/defaults';
import { defaultPerformance, type PerformanceLedger, type PerformanceTier } from '../src/shared/performance';
import { simulatedEvent, simulationSchema } from '../src/providers/simulator';
import { ruleSchema, type Job } from '../src/shared/model';
import { Repository } from '../src/storage/repository';

const queues: ActionQueue[] = [];
afterEach(() => queues.splice(0).forEach((q) => q.stop()));
function job(cost?: PerformanceTier): Job {
  return {
    id: crypto.randomUUID(),
    ruleId: 'r',
    ruleName: 'rule',
    eventId: 'e',
    priority: 'NORMAL',
    actions: [newAction('LogMessage')],
    event: simulatedEvent(simulationSchema.parse({ type: 'FOLLOW' })),
    variables: {},
    status: 'QUEUED',
    createdAt: Date.now(),
    notBefore: 0,
    errorPolicy: 'STOP_JOB',
    dryRun: false,
    performance: cost ? { cost, windowMs: 1000 } : undefined,
  };
}
function harness() {
  let now = 10000;
  let ledger: PerformanceLedger | undefined;
  const settings = defaultPerformance();
  settings.enabled = true;
  const log = new Logger();
  const guard = new PerformanceGuard(
    () => settings,
    log,
    (data) => {
      ledger = structuredClone(data);
    },
    undefined,
    () => now,
  );
  return {
    guard,
    settings,
    log,
    ledger: () => ledger,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
it.each(['HEAVY', 'EXTREME'] as const)(
  '%s reserves while running, then waits through the estimated window',
  (cost) => {
    const h = harness(),
      first = job(cost),
      second = job(cost);
    expect(h.guard.inspect(first, false).kind).toBe('ALLOW');
    h.guard.begin(first, false);
    h.advance(2000);
    expect(h.guard.inspect(second, false).kind).toBe('WAIT');
    h.guard.finish(first);
    h.advance(999);
    expect(h.guard.inspect(second, false).kind).toBe('WAIT');
    h.advance(1);
    expect(h.guard.inspect(second, false).kind).toBe('ALLOW');
    expect(h.log.entries.some((l) => l.message.includes('vencida/liberada'))).toBe(true);
  },
);
it('DROP reports a reason; LIGHT and legacy jobs do not wait for HEAVY', () => {
  const h = harness();
  h.settings.policy = 'DROP';
  h.guard.begin(job('HEAVY'), false);
  expect(h.guard.inspect(job('HEAVY'), false)).toMatchObject({
    kind: 'DROP',
    reason: expect.stringContaining('HEAVY'),
  });
  expect(h.guard.inspect(job('LIGHT'), false).kind).toBe('ALLOW');
  expect(h.guard.inspect(job(), false).kind).toBe('ALLOW');
});
it('cooldown and post-execution window both apply', () => {
  const h = harness();
  h.settings.tiers.HEAVY.cooldownMs = 5000;
  const first = job('HEAVY');
  h.guard.begin(first, false);
  h.guard.finish(first);
  h.advance(1001);
  expect(h.guard.inspect(job('HEAVY'), false)).toMatchObject({ kind: 'WAIT', until: 15000 });
  h.advance(4000);
  expect(h.guard.inspect(job('HEAVY'), false).kind).toBe('ALLOW');
});
it('real and DRY RUN reservations are isolated; disabling does not erase real leases', () => {
  const h = harness();
  h.guard.begin(job('HEAVY'), false);
  expect(h.guard.inspect(job('HEAVY'), true).kind).toBe('ALLOW');
  h.guard.begin(job('HEAVY'), true);
  expect(h.ledger()?.reservations).toHaveLength(1);
  h.settings.enabled = false;
  expect(h.guard.inspect(job('HEAVY'), false).kind).toBe('ALLOW');
  h.settings.enabled = true;
  expect(h.guard.inspect(job('HEAVY'), false).kind).toBe('WAIT');
});
it('persists minimal real leases through SQLite and restores active/crashed reservations conservatively', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'lf-v04-')), 'state.sqlite');
  let repo = new Repository(path);
  const h = harness();
  const first = job('EXTREME');
  h.guard.begin(first, false);
  repo.saveSettings({ ...repo.settings(), performanceLedger: h.ledger() });
  repo.close();
  repo = new Repository(path);
  const recovered = new PerformanceGuard(
    () => h.settings,
    h.log,
    () => {},
    repo.settings().performanceLedger,
    () => 50000,
  );
  expect(recovered.snapshot.reservations[0]).toMatchObject({ active: false, until: 51000 });
  expect(recovered.inspect(job('EXTREME'), false).kind).toBe('WAIT');
  expect(JSON.stringify(repo.settings().performanceLedger)).not.toContain('command');
  repo.close();
});
it('resumes a finished reservation at its original expiry rather than starting it again', () => {
  const h = harness(),
    first = job('HEAVY');
  h.guard.begin(first, false);
  h.guard.finish(first);
  h.advance(500);
  const restored = new PerformanceGuard(
    () => h.settings,
    h.log,
    () => {},
    h.ledger(),
    h.now,
  );
  expect(restored.snapshot.reservations[0]?.until).toBe(11000);
  h.advance(501);
  restored.tick();
  expect(restored.snapshot.reservations).toHaveLength(0);
});
it('persistence failure prevents reservation and therefore prevents gameplay', () => {
  const h = harness();
  const broken = new PerformanceGuard(
    () => h.settings,
    h.log,
    () => {
      throw new Error('disk');
    },
  );
  expect(() => broken.begin(job('HEAVY'), false)).toThrow('disk');
  expect(broken.snapshot.reservations).toHaveLength(0);
});
it('serial queue admits LIGHT while HEAVY waits, then admits the next HEAVY after expiry', async () => {
  const settings = defaultPerformance();
  settings.enabled = true;
  const log = new Logger();
  const guard = new PerformanceGuard(
    () => settings,
    log,
    () => {},
  );
  const queue = new ActionQueue(log, 20, Math.random, guard);
  queues.push(queue);
  queue.dryRun = false;
  const order: string[] = [];
  queue.register('LogMessage', async (_, c) => {
    order.push(c.job.ruleName);
  });
  const a = { ...job('HEAVY'), ruleName: 'a', performance: { cost: 'HEAVY' as const, windowMs: 200 } };
  queue.enqueue(a);
  await expect.poll(() => queue.completed).toBe(1);
  const b = queue.enqueue({ ...a, ruleName: 'b' })!;
  queue.enqueue({ ...job('LIGHT'), ruleName: 'light' });
  await expect.poll(() => queue.completed).toBe(3);
  expect(order).toEqual(['a', 'light', 'b']);
  expect(b.status).toBe('COMPLETED');
  expect(log.entries.some((l) => l.message.includes('Evento en espera'))).toBe(true);
});
it('STOP cancels queued work but preserves the estimated reservation of a started job', async () => {
  const h = harness();
  const queue = new ActionQueue(h.log, 20, Math.random, h.guard);
  queues.push(queue);
  queue.dryRun = false;
  let release!: () => void;
  queue.register(
    'LogMessage',
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const running = queue.enqueue(job('HEAVY'))!;
  await expect.poll(() => running.status).toBe('RUNNING');
  const pending = queue.enqueue(job('EXTREME'))!;
  queue.stop();
  release();
  await expect.poll(() => running.status).toBe('CANCELLED');
  expect(pending.status).toBe('CANCELLED');
  expect(h.guard.snapshot.reservations).toHaveLength(1);
  expect(h.guard.inspect(job('HEAVY'), false).kind).toBe('WAIT');
});
it('PER_ITEM is capped only for opted-in rules with protection enabled; old rule shape round-trips', () => {
  const h = harness();
  const queue = new ActionQueue(h.log);
  queues.push(queue);
  queue.pause();
  const legacy = newRule('p');
  expect(ruleSchema.parse(legacy)).toEqual(legacy);
  const rule = {
    ...legacy,
    performanceCost: 'HEAVY' as const,
    actions: [
      { ...newAction(), giftQuantity: { mode: 'PER_ITEM' as const, interval: 0, maxExecutions: 10 } },
    ],
  };
  const engine = new RulesEngine(
    queue,
    () => [rule],
    () => 'player',
    h.log,
    Date.now,
    {},
    () => h.settings,
  );
  engine.enabled = true;
  engine.process(simulatedEvent(simulationSchema.parse({ type: 'GIFT', quantity: 5 })));
  expect(queue.snapshot[0]?.actions[0]?.repeatCount).toBe(1);
  h.settings.enabled = false;
  engine.process(simulatedEvent(simulationSchema.parse({ type: 'GIFT', quantity: 5 })));
  expect(queue.snapshot[1]?.actions[0]?.repeatCount).toBe(5);
});
it('queue DROP marks cancelled with a logged reason', async () => {
  const h = harness();
  h.settings.policy = 'DROP';
  h.guard.begin(job('EXTREME'), false);
  const q = new ActionQueue(h.log, 20, Math.random, h.guard);
  queues.push(q);
  q.dryRun = false;
  const dropped = q.enqueue(job('EXTREME'))!;
  await expect.poll(() => dropped.status).toBe('CANCELLED');
  expect(h.log.entries.some((l) => l.message.includes('Evento descartado'))).toBe(true);
});

it('a protected job admitted in DRY RUN cannot turn real halfway through its sequence', async () => {
  const h = harness(),
    queue = new ActionQueue(h.log, 20, Math.random, h.guard);
  queues.push(queue);
  let release!: () => void;
  const modes: boolean[] = [];
  queue.register('LogMessage', async (_, ctx) => {
    modes.push(ctx.dryRun);
    if (modes.length === 1)
      await new Promise<void>((r) => {
        release = r;
      });
  });
  const running = queue.enqueue({
    ...job('HEAVY'),
    actions: [newAction('LogMessage'), newAction('LogMessage')],
  })!;
  await expect.poll(() => modes.length).toBe(1);
  queue.dryRun = false;
  release();
  await expect.poll(() => running.status).toBe('COMPLETED');
  expect(modes).toEqual([true, true]);
  expect(h.guard.snapshot.reservations[0]?.simulated).toBe(true);
});

it('rule cooldown QUEUE and reservation window independently delay dispatch', async () => {
  const h = harness(),
    queue = new ActionQueue(h.log, 20, Math.random, h.guard);
  queues.push(queue);
  queue.dryRun = false;
  const rule = {
    ...newRule('p'),
    trigger: { type: 'FOLLOW' as const },
    performanceCost: 'HEAVY' as const,
    performanceWindowMs: 300,
    cooldown: { duration: 80, policy: 'QUEUE' as const },
    actions: [newAction('LogMessage')],
  };
  const engine = new RulesEngine(
    queue,
    () => [rule],
    () => 'player',
    h.log,
    Date.now,
    {},
    () => h.settings,
  );
  engine.enabled = true;
  // The deterministic guard's clock advances independently of the scheduler's real cooldown.
  queue.register('LogMessage', async () => {});
  engine.process(simulatedEvent(simulationSchema.parse({ type: 'FOLLOW' })));
  await expect.poll(() => queue.completed).toBe(1);
  engine.process(simulatedEvent(simulationSchema.parse({ type: 'FOLLOW' })));
  const second = queue.snapshot[1]!;
  expect(second.notBefore).toBeGreaterThan(queue.snapshot[0]!.notBefore);
  await expect.poll(() => second.waitReason).toContain('HEAVY');
  h.advance(301);
  queue.resume();
  await expect.poll(() => second.status).toBe('COMPLETED');
});
