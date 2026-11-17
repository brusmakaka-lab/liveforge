import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlertStore } from '../src/core/alert-store';
import { AudioQueue } from '../src/main/audio-queue';
import { DesktopMedia } from '../src/main/media';
import { RulesEngine } from '../src/core/rules-engine';
import { ActionQueue } from '../src/core/queue';
import { Logger } from '../src/core/logging';
import { newAction, newRule } from '../src/shared/defaults';
import { simulatedEvent, simulationSchema } from '../src/providers/simulator';
import { TikTokNormalizer } from '../src/providers/tiktok-normalizer';
import { alertDetails, safeGiftImage, type AlertDetails } from '../src/shared/media';
import type { MediaMessage } from '../src/shared/api';
import type { Rule } from '../src/shared/model';
import { Repository } from '../src/storage/repository';

const gift = (quantity: number, end = false, extra = {}) =>
  simulatedEvent(
    simulationSchema.parse({
      type: 'GIFT',
      giftName: 'Rose',
      quantity,
      repeatEnd: end,
      streakId: 'one',
      ...extra,
    }),
  );
const details = (n: number, end = false): AlertDetails => ({
  ...alertDetails(gift(n, end), 'r', 'a'),
  progress: true,
});
afterEach(() => vi.useRealTimers());

describe('v0.2 streak presentation and compatibility', () => {
  it('keeps one alert x1/x2/x5/final, ignores queued replay, expires and does not reappear', () => {
    let now = 0;
    const store = new AlertStore(
      () => undefined,
      () => now,
    );
    for (const n of [1, 2, 5]) {
      store.show(`Rose x${n}`, 2000, details(n));
      expect(store.snapshot).toHaveLength(1);
    }
    store.show('Rose x5', 2000, details(5, true));
    store.show('old queued x1', 2000, { ...details(1), progress: false });
    expect(store.snapshot[0]).toMatchObject({ quantity: 5, text: 'Rose x5', activeStreak: false });
    now = 2000;
    store.tick();
    expect(store.snapshot[0]?.leaving).toBe(true);
    now = 2250;
    store.tick();
    expect(store.snapshot).toHaveLength(0);
    store.show('late replay', 2000, details(5, true));
    expect(store.snapshot).toHaveLength(0);
  });
  it('bounds concurrent alerts, respects impact and expires missing finals', () => {
    let now = 0;
    const store = new AlertStore(
      () => undefined,
      () => now,
    );
    for (let n = 0; n < 3; n++) store.show('epic', 2000, { ...details(1), id: String(n), impact: 'EPIC' });
    store.show('low', 2000, { ...details(1), id: 'low', impact: 'LOW' });
    expect(store.snapshot.map((a) => a.id)).toEqual(['0', '1', '2']);
    now = 30250;
    store.tick();
    expect(store.snapshot).toHaveLength(0);
  });
  it.each([
    ['EACH_GIFT', 5],
    ['STREAK_UPDATE', 3],
    ['STREAK_END', 1],
  ] as const)('%s schedules %i jobs without duplicate final or visual replays', (mode, jobs) => {
    const rule: Rule = {
      ...newRule('p'),
      trigger: { type: 'GIFT', giftId: '', giftName: 'Rose', mode },
      showStreakProgress: true,
    };
    const queue = new ActionQueue(new Logger());
    queue.pause();
    const progress = vi.fn();
    const engine = new RulesEngine(
      queue,
      () => [rule],
      () => 'Ainztk58',
      new Logger(),
      Date.now,
      { progress },
    );
    engine.enabled = true;
    for (const n of [1, 2, 5]) {
      const event = gift(n);
      engine.process(event);
      engine.process(event);
    }
    engine.process(gift(5, true));
    engine.process(gift(5, true));
    engine.process(gift(3));
    expect(queue.pendingCount).toBe(jobs);
    expect(progress).toHaveBeenCalledTimes(4);
    if (mode === 'STREAK_END') expect(queue.snapshot[0]?.variables.giftCount).toBe(5);
    engine.stop();
    engine.process(gift(1, false, { streakId: 'two' }));
    expect(progress).toHaveBeenCalledTimes(4);
  });
  it('keeps legacy visual opt-out and isolates progress errors from gameplay', () => {
    const rule = newRule('p');
    const queue = new ActionQueue(new Logger());
    queue.pause();
    const progress = vi.fn(() => {
      throw new Error('display failed');
    });
    const engine = new RulesEngine(
      queue,
      () => [rule],
      () => 'Ainztk58',
      new Logger(),
      Date.now,
      { progress },
    );
    engine.enabled = true;
    engine.process(gift(1, true));
    expect(progress).not.toHaveBeenCalled();
    expect(queue.pendingCount).toBe(1);
    rule.showStreakProgress = true;
    engine.process(gift(1, true, { streakId: 'second' }));
    expect(progress).toHaveBeenCalledOnce();
    expect(queue.pendingCount).toBe(2);
  });
  it('respects progress conditions; audio and command wait for final despite early alerts', () => {
    const messages: MediaMessage[] = [];
    const media = new DesktopMedia(
      (m) => messages.push(m),
      () => ({ volume: 1, mute: false }),
      () => undefined,
    );
    const rule = newRule('p');
    rule.showStreakProgress = true;
    rule.actions = [
      {
        ...newAction('ShowAlert'),
        type: 'ShowAlert',
        text: '@{{username}} envió {{giftName}} x{{giftCount}}',
        duration: 2000,
      },
      newAction(),
    ];
    const queue = new ActionQueue(new Logger());
    queue.pause();
    const engine = new RulesEngine(
      queue,
      () => [rule],
      () => 'Ainztk58',
      new Logger(),
      Date.now,
      { progress: (r, e) => media.progress(r, e, 'Ainztk58', 0), stop: () => media.stop() },
    );
    engine.enabled = true;
    try {
      engine.process(gift(1));
      engine.process(gift(2));
      engine.process(gift(5));
      expect(queue.pendingCount).toBe(0);
      expect(media.alerts.snapshot[0]?.text).toContain('x5');
      engine.process(gift(5, true));
      expect(queue.pendingCount).toBe(1);
      engine.stop();
      expect(media.alerts.snapshot).toHaveLength(0);
      rule.conditions.username = 'someone_else';
      engine.enabled = true;
      engine.process(gift(1, false, { streakId: 'second' }));
      expect(media.alerts.snapshot).toHaveLength(0);
    } finally {
      media.dispose();
    }
  });
  it('uses displayId only as fallback, preserves content and reads image without enrichment', () => {
    const normalizer = new TikTokNormalizer();
    const image = 'https://p16-webcast.tiktokcdn.com/gift.png';
    const event = normalizer.normalize('GIFT', {
      user: { id: 'u', displayId: 'sender' },
      giftId: 1,
      gift: { name: 'Rose', type: 1, image: { urlList: [image] } },
      repeatCount: 2,
    });
    expect(event.user.username).toBe('sender');
    if (event.type === 'GIFT') expect(event.payload.giftImage).toBe(image);
    const chat = normalizer.normalize('CHAT', {
      user: { uniqueId: 'old', displayId: 'new' },
      content: '!boss',
      comment: 'wrong',
    });
    expect(chat.user.username).toBe('old');
    if (chat.type === 'CHAT') expect(chat.payload.message).toBe('!boss');
    expect(safeGiftImage('file:///secret')).toBeUndefined();
    expect(safeGiftImage('https://localhost/image')).toBeUndefined();
    expect(safeGiftImage('https://tiktokcdn.com.attacker.test/a')).toBeUndefined();
  });
  it('loads old data and round-trips v0.2 fields without a SQLite migration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'liveforge-v02-'));
    const path = join(dir, 'test.sqlite');
    let repo = new Repository(path);
    repo.savePreset({ id: 'p', name: 'Legacy', createdAt: 0 });
    const legacy = newRule('p');
    repo.saveRule(legacy);
    const old = repo.rules()[0]!;
    expect(old.showStreakProgress).toBeUndefined();
    expect(old.impact).toBeUndefined();
    repo.saveRule({
      ...old,
      impact: 'EPIC',
      showStreakProgress: true,
      trigger: { type: 'GIFT', giftName: 'Rose', giftId: '', mode: 'STREAK_UPDATE' },
    });
    const copy = repo.duplicatePreset('p');
    repo.close();
    repo = new Repository(path);
    try {
      expect(repo.rules().find((r) => r.presetId === copy.id)).toMatchObject({
        impact: 'EPIC',
        showStreakProgress: true,
        trigger: { mode: 'STREAK_UPDATE' },
      });
    } finally {
      repo.close();
    }
  });
});

describe('v0.2 bounded audio queue', () => {
  const fixture = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lf-audio-'));
    const file = join(dir, 'sound.wav');
    await writeFile(file, Buffer.from('fixture'));
    return file;
  };
  it('serializes until ended, gives EPIC priority, applies master volume and clears on STOP', async () => {
    const file = await fixture();
    const messages: MediaMessage[] = [];
    const queue = new AudioQueue(
      (m) => messages.push(m),
      () => ({ volume: 0.5, mute: false }),
      () => undefined,
    );
    try {
      await queue.play(file, 0.4);
      await vi.waitFor(() => expect(messages.filter((m) => m.type === 'audio')).toHaveLength(1));
      await queue.play(file, 1, undefined, 'LOW');
      await queue.play(file, 0.8, undefined, 'EPIC');
      const first = messages.find((m) => m.type === 'audio')!;
      if (first.type !== 'audio') throw Error();
      expect(first.volume).toBe(0.2);
      queue.result(first.id);
      expect(messages.filter((m) => m.type === 'audio')).toHaveLength(1);
      queue.result(first.id, undefined, 'ended');
      await vi.waitFor(() => expect(messages.filter((m) => m.type === 'audio')).toHaveLength(2));
      expect(messages.filter((m) => m.type === 'audio')[1]).toMatchObject({ volume: 0.4 });
      queue.stop();
      expect(queue.pendingCount).toBe(0);
    } finally {
      queue.stop();
    }
  });
  it('bounds bursts and discards stale pending audio', async () => {
    const file = await fixture();
    let now = 0;
    const warn = vi.fn();
    const messages: MediaMessage[] = [];
    const queue = new AudioQueue(
      (m) => messages.push(m),
      () => ({ volume: 1, mute: false }),
      warn,
      () => now,
    );
    try {
      await queue.play(file, 1);
      await vi.waitFor(() => expect(messages.some((m) => m.type === 'audio')).toBe(true));
      for (let i = 0; i < 40; i++) await queue.play(file, 1);
      expect(queue.pendingCount).toBe(20);
      now = 16000;
      const first = messages.find((m) => m.type === 'audio')!;
      if (first.type !== 'audio') throw Error();
      queue.result(first.id, undefined, 'ended');
      expect(queue.pendingCount).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally {
      queue.stop();
    }
  });
  it('recovers from a missing file, mute and decoder errors without hanging', async () => {
    const file = await fixture();
    let mute = true;
    const warn = vi.fn();
    const messages: MediaMessage[] = [];
    const queue = new AudioQueue(
      (m) => messages.push(m),
      () => ({ volume: 1, mute }),
      warn,
    );
    try {
      await queue.play(file, 1);
      expect(messages).toHaveLength(0);
      mute = false;
      await queue.play(file + '.missing.wav', 1);
      await queue.play(file, 1);
      await vi.waitFor(() => expect(messages.some((m) => m.type === 'audio')).toBe(true));
      expect(warn).toHaveBeenCalled();
      const first = messages.find((m) => m.type === 'audio')!;
      if (first.type !== 'audio') throw Error();
      queue.result(first.id, 'decode error');
      expect(messages.at(-1)?.type).toBe('stopAudio');
    } finally {
      queue.stop();
    }
  });
  it('does not play a file whose read completes after STOP', async () => {
    const file = await fixture();
    const messages: MediaMessage[] = [];
    const queue = new AudioQueue(
      (m) => messages.push(m),
      () => ({ volume: 1, mute: false }),
      () => undefined,
    );
    await queue.play(file, 1);
    queue.stop();
    await new Promise((r) => setTimeout(r, 50));
    expect(messages.some((m) => m.type === 'audio')).toBe(false);
  });
});
