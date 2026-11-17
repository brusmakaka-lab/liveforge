import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { EventEmitter } from 'node:events';
import { Logger } from '../src/core/logging';
import type { InternalLiveEvent } from '../src/shared/model';

type FakeConnection = EventEmitter & {
  username: string;
  options: Record<string, unknown>;
  disconnect: () => Promise<void>;
};
const control = vi.hoisted(() => ({ instances: [] as FakeConnection[], failures: 0 }));
vi.mock('tiktok-live-connector', async () => {
  const { EventEmitter } = await import('node:events');
  class Fake extends EventEmitter {
    constructor(
      readonly username: string,
      readonly options: Record<string, unknown>,
    ) {
      super();
      control.instances.push(this);
    }
    async connect(): Promise<void> {
      if (control.failures > 0) {
        control.failures--;
        throw new Error('network down');
      }
    }
    async disconnect(): Promise<void> {
      this.emit('disconnected');
    }
  }
  return {
    TikTokLiveConnection: Fake,
    SignConfig: {},
    ControlEvent: { ERROR: 'error', DISCONNECTED: 'disconnected' },
    WebcastEvent: {
      GIFT: 'gift',
      LIKE: 'like',
      CHAT: 'chat',
      MEMBER: 'member',
      FOLLOW: 'follow',
      SHARE: 'share',
      SUB_NOTIFY: 'subNotify',
      STREAM_END: 'streamEnd',
    },
  };
});
import { TikTokProvider } from '../src/providers/tiktok';

beforeEach(() => {
  vi.useFakeTimers();
  control.instances = [];
  control.failures = 0;
});
afterEach(() => vi.useRealTimers());
function provider() {
  const events: InternalLiveEvent[] = [];
  const log = new Logger();
  const ended = vi.fn();
  return {
    events,
    log,
    ended,
    p: new TikTokProvider((event) => events.push(event), log, {
      retainRaw: () => false,
      signKey: async () => undefined,
      onEnded: ended,
    }),
  };
}
describe('TikTok lifecycle boundary', () => {
  it.each(['@Palermotusi', 'PALERMOTUSI', '  @Palermotusi  '])(
    'normalizes %s before room resolution and preserves it on reconnect',
    async (username) => {
      const h = provider();
      await h.p.connect(username);
      expect(control.instances[0]!.username).toBe('palermotusi');
      control.instances[0]!.emit('disconnected');
      await vi.advanceTimersByTimeAsync(2000);
      expect(control.instances[1]!.username).toBe('palermotusi');
      await h.p.disconnect();
    },
  );
  it('logs the connector error envelope with nested causes instead of object Object', async () => {
    const h = provider();
    await h.p.connect('testcreator');
    control.instances[0]!.emit('error', {
      info: 'Error while connecting',
      exception: new Error('Room resolution failed', { cause: new Error('user_not_found') }),
    });
    const entry = h.log.entries.find((entry) => entry.level === 'ERROR')!;
    expect(entry.message).toContain('user_not_found');
    expect(entry.message).not.toContain('[object Object]');
    expect(entry.data).toMatchObject({
      error: {
        exception: {
          message: 'Room resolution failed',
          stack: expect.any(String),
          cause: { message: 'user_not_found' },
        },
      },
    });
    await h.p.disconnect();
  });
  it('disables history and normalizes live events with no provider shape leakage', async () => {
    const h = provider();
    await h.p.connect('@testcreator');
    const connection = control.instances[0]!;
    expect(connection.options.processInitialData).toBe(false);
    expect(connection.options.enableExtendedGiftInfo).toBe(false);
    expect(h.p.getStatus().state).toBe('CONNECTED');
    connection.emit('follow', { common: { msgId: '1' }, user: { id: 'u', uniqueId: 'juan' } });
    expect(h.events[0]).toMatchObject({
      type: 'FOLLOW',
      user: { id: 'u', username: 'juan' },
      source: 'tiktok',
    });
    expect(h.events[0]).not.toHaveProperty('common');
    await h.p.disconnect();
  });
  it('backs off 2s then 4s and stops reconnecting after manual disconnect', async () => {
    control.failures = 2;
    const h = provider();
    await h.p.connect('testcreator');
    expect(h.p.getStatus().state).toBe('RECONNECTING');
    await vi.advanceTimersByTimeAsync(1999);
    expect(control.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(control.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(control.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.p.getStatus().state).toBe('CONNECTED');
    control.instances.at(-1)!.emit('disconnected');
    await h.p.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(control.instances).toHaveLength(3);
    expect(h.p.getStatus().state).toBe('DISCONNECTED');
  });
  it('drops old history after reconnect and ignores orphan connection listeners', async () => {
    const h = provider();
    await h.p.connect('testcreator');
    const old = control.instances[0]!;
    old.emit('disconnected');
    await vi.advanceTimersByTimeAsync(2000);
    const current = control.instances[1]!;
    old.emit('follow', { user: { uniqueId: 'old' } });
    current.emit('follow', {
      common: { createTime: String(Math.floor((Date.now() - 60_000) / 1000)) },
      user: { uniqueId: 'stale' },
    });
    current.emit('follow', { user: { uniqueId: 'new' } });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.user.username).toBe('new');
    await h.p.disconnect();
  });
  it('contains malformed events and excludes cancellations/refunds from subscriptions', async () => {
    const h = provider();
    await h.p.connect('testcreator');
    const c = control.instances[0]!;
    c.emit('like', { count: -10 });
    c.emit('subNotify', { subscribingStatus: 4, user: { uniqueId: 'refund' } });
    c.emit('subNotify', { subscribingStatus: 1, user: { uniqueId: 'subscriber' } });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.type).toBe('SUBSCRIBE');
    expect(h.log.errors).toBe(1);
    await h.p.disconnect();
  });
  it('ends the session instead of reconnecting after stream end', async () => {
    const h = provider();
    await h.p.connect('testcreator');
    control.instances[0]!.emit('streamEnd');
    control.instances[0]!.emit('disconnected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.ended).toHaveBeenCalledTimes(1);
    expect(control.instances).toHaveLength(1);
    await h.p.disconnect();
  });
});
