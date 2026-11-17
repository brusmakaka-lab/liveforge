import { afterEach, describe, expect, it } from 'vitest';
import { setTimeout as sleep } from 'node:timers/promises';
import { ActionQueue } from '../src/core/queue';
import { registerActionHandlers } from '../src/core/action-handlers';
import { Logger } from '../src/core/logging';
import { newAction } from '../src/shared/defaults';
import { simulatedEvent, simulationSchema } from '../src/providers/simulator';
import type { Action, Job, Priority } from '../src/shared/model';

const queues: ActionQueue[] = [];
afterEach(() => queues.forEach((q) => q.stop()));
const waitFor = async (fn: () => boolean) => {
  for (let i = 0; i < 100 && !fn(); i++) await sleep(10);
  expect(fn()).toBe(true);
};
function setup(dryRun = false) {
  const commands: string[] = [];
  const log = new Logger();
  const queue = new ActionQueue(log, 10);
  queues.push(queue);
  queue.dryRun = dryRun;
  registerActionHandlers(queue, {
    log,
    game: () => ({
      connect: async () => {},
      disconnect: async () => {},
      execute: async (a) => {
        commands.push(a.command);
        return 'OK';
      },
      testConnection: async () => ({ response: 'OK', latency: 1 }),
      getStatus: () => ({ state: 'CONNECTED' }),
    }),
    audio: {
      play: async () => {
        throw new Error('missing audio');
      },
    },
    overlay: { show: async () => {} },
  });
  const add = (actions: Action[], priority: Priority = 'NORMAL'): Job =>
    queue.enqueue({
      ruleId: crypto.randomUUID(),
      ruleName: priority,
      eventId: crypto.randomUUID(),
      priority,
      actions,
      event: simulatedEvent(simulationSchema.parse({ type: 'FOLLOW' })),
      variables: { player: 'Ainztk58' },
      notBefore: Date.now(),
      errorPolicy: 'STOP_JOB',
      dryRun,
    })!;
  return { queue, commands, log, add };
}
describe('Action scheduler', () => {
  it('honors repeats, delays and intervals in order', async () => {
    const h = setup();
    const a = { ...newAction(), repeatCount: 3, delayBefore: 20, intervalBetweenRepeats: 20 };
    const started = Date.now();
    const job = h.add([a]);
    await waitFor(() => job.status === 'COMPLETED');
    expect(h.commands).toHaveLength(3);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
  });
  it('prioritizes pending critical work without interrupting running work', async () => {
    const h = setup();
    h.queue.pause();
    const low = h.add([newAction()], 'LOW');
    const critical = h.add([newAction()], 'CRITICAL');
    h.queue.resume();
    await waitFor(() => low.status === 'COMPLETED');
    expect(critical.startedAt!).toBeLessThanOrEqual(low.startedAt!);
  });
  it('pauses between steps; clear only removes pending jobs', async () => {
    const h = setup();
    h.queue.pause();
    const job = h.add([newAction()]);
    await sleep(30);
    expect(h.commands).toHaveLength(0);
    h.queue.clear();
    h.queue.resume();
    await sleep(30);
    expect(job.status).toBe('CANCELLED');
  });
  it('STOP cancels an active wait and its subsequent command', async () => {
    const h = setup();
    const wait = { ...newAction('Wait'), type: 'Wait' as const, duration: 3000 };
    const job = h.add([wait, newAction()]);
    await sleep(20);
    h.queue.stop();
    await waitFor(() => job.status === 'CANCELLED');
    expect(h.commands).toHaveLength(0);
  });
  it('does not interrupt an already-sent command but blocks the next action', async () => {
    const h = setup();
    let release!: () => void;
    let sent = 0;
    h.queue.register('MinecraftCommand', async () => {
      sent++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const job = h.add([newAction(), newAction()]);
    await waitFor(() => sent === 1);
    h.queue.stop();
    release();
    await waitFor(() => job.status === 'CANCELLED');
    expect(sent).toBe(1);
  });
  it('dry run logs rendered command without transport access', async () => {
    const h = setup(true);
    const job = h.add([newAction()]);
    await waitFor(() => job.status === 'COMPLETED');
    expect(h.commands).toHaveLength(0);
    expect(h.log.entries.some((e) => e.message.includes('[DRY RUN]') && e.message.includes('Ainztk58'))).toBe(
      true,
    );
  });
  it('audio failure does not stop Minecraft; command failure does not kill queue', async () => {
    const h = setup();
    const job = h.add([newAction('PlaySound'), newAction()]);
    await waitFor(() => job.status === 'COMPLETED');
    expect(h.commands).toHaveLength(1);
    h.queue.register('MinecraftCommand', async () => {
      throw new Error('transport failed');
    });
    const failed = h.add([newAction()]);
    const next = h.add([newAction('LogMessage')]);
    await waitFor(() => next.status === 'COMPLETED');
    expect(failed.status).toBe('FAILED');
  });
});
