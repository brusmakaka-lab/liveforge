import { expectRenderedOverlay } from '../support/overlay-visibility';
import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { newAction, newRule } from '../../src/shared/defaults';
import type { Request } from '../../src/shared/api';
import type { Rule } from '../../src/shared/model';
const require = createRequire(import.meta.url);

test('v0.2 Simulator → one live streak alert → serialized audio → DRY RUN; overlay isolation and focus', async () => {
  await mkdir('work/v02', { recursive: true });
  const profile = await mkdtemp(resolve('work/v02/e2e-'));
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  env.LIVEFORGE_DATA_DIR = profile;
  delete env.ELECTRON_RUN_AS_NODE;
  const exe = process.env.LIVEFORGE_TEST_EXE;
  const app = await electron.launch({
    executablePath: exe ?? (require('electron') as string),
    args: exe ? [] : [resolve('out/main/index.js')],
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await expect(page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' })).toBeVisible();
    const request = (input: Request) => page.evaluate((input) => window.liveforge.request(input), input);
    const state = async () => {
      const r = await request({ op: 'snapshot' });
      if (!r.ok || !r.snapshot) throw Error('No snapshot');
      return r.snapshot;
    };
    const initial = await state();
    const samples = 3200;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + samples * 2, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24);
    wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++)
      wav.writeInt16LE(Math.round(Math.sin((i * 440 * Math.PI * 2) / 16000) * 100), 44 + i * 2);
    const sound = join(profile, 'test.wav');
    await writeFile(sound, wav);
    // Observe real HTMLAudio playback; no mocked audio implementation or network.
    await page.evaluate(() => {
      const original = HTMLMediaElement.prototype.play;
      const stats = { started: 0, ended: 0, active: 0, max: 0 };
      Object.assign(window, { audioStats: stats });
      HTMLMediaElement.prototype.play = function () {
        return original.call(this).then(() => {
          stats.started++;
          stats.active++;
          stats.max = Math.max(stats.max, stats.active);
          this.addEventListener(
            'ended',
            () => {
              stats.ended++;
              stats.active--;
            },
            { once: true },
          );
        });
      };
    });
    const rule: Rule = {
      ...newRule(initial.settings.activePresetId),
      name: 'v0.2 Rose test',
      impact: 'EPIC',
      showStreakProgress: true,
      actions: [
        {
          ...newAction('ShowAlert'),
          type: 'ShowAlert',
          text: '@{{username}} envió 🌹 {{giftName}} x{{giftCount}}',
          duration: 1000,
        },
        { ...newAction('PlaySound'), type: 'PlaySound', file: sound, volume: 0.1 },
        newAction(),
      ],
    };
    expect((await request({ op: 'saveRule', rule })).ok).toBe(true);
    await page.getByRole('button', { name: 'Simulator', exact: true }).click();
    const beforeFocus = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.focus();
      return w.id;
    });
    await page.getByRole('button', { name: 'Abrir overlay', exact: true }).click();
    await expect.poll(() => app.windows().length).toBe(2);
    const overlay = app.windows().find((w) => w !== page)!;
    await expect.poll(() => overlay.url()).toContain('#overlay');
    overlay.on('pageerror', (e) => errors.push(e.message));
    const properties = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('#overlay'))!;
      return {
        focusable: w.isFocusable(),
        focused: w.isFocused(),
        alwaysOnTop: w.isAlwaysOnTop(),
        focusedId: BrowserWindow.getFocusedWindow()?.id,
      };
    });
    expect(properties).toMatchObject({
      focusable: false,
      focused: false,
      alwaysOnTop: true,
      focusedId: beforeFocus,
    });
    expect(await overlay.evaluate(async () => window.liveforge.request({ op: 'startEvents' }))).toMatchObject(
      { ok: false },
    );
    await page.getByRole('button', { name: 'START EVENTS', exact: true }).click();
    await page.getByLabel('Username del espectador').fill('testuser');
    let alertId = '';
    for (const n of [1, 2, 5]) {
      await page.getByRole('button', { name: `Racha x${n}`, exact: true }).click();
      await expect(overlay.getByRole('alert')).toHaveCount(1);
      await expect(overlay.locator('.gift-count')).toHaveText(`×${n}`);
      await expectRenderedOverlay(app, overlay);
      if (n === 1) alertId = (await overlay.getByRole('alert').getAttribute('data-alert-id'))!;
      else expect(await overlay.getByRole('alert').getAttribute('data-alert-id')).toBe(alertId);
      expect((await state()).jobs.filter((j) => j.ruleId === rule.id)).toHaveLength(0);
    }
    expect(await page.evaluate(() => Reflect.get(window, 'audioStats').started)).toBe(0);
    await overlay.screenshot({ path: 'work/v02/overlay-streak-x5.png', omitBackground: true });
    await page.screenshot({ path: 'work/v02/simulator-x5.png' });
    await page.getByRole('button', { name: 'Finalizar racha', exact: true }).click();
    await expect(overlay.getByRole('alert')).toHaveCount(1);
    expect(await overlay.getByRole('alert').getAttribute('data-alert-id')).toBe(alertId);
    await expect(overlay.locator('.gift-count')).toHaveText('×5');
    await expect(overlay.getByRole('alert')).toContainText('LIVE EVENT');
    await expectRenderedOverlay(app, overlay);
    // Duplicate final with a new event id must not re-trigger the same streak.
    const streakId = String(JSON.parse(alertId)[4]);
    await request({
      op: 'simulate',
      event: {
        type: 'GIFT',
        username: 'testuser',
        giftId: '5655',
        giftName: 'Rose',
        quantity: 5,
        repeatEnd: true,
        streak: true,
        streakId,
        diamondCount: 1,
        likeCount: 0,
        message: '',
      },
    });
    await expect
      .poll(async () => (await state()).jobs.find((j) => j.ruleId === rule.id)?.status)
      .toBe('COMPLETED');
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'audioStats').ended)).toBe(1);
    expect(
      (await state()).logs.some(
        (l) => l.message.includes('[DRY RUN]') && l.message.includes('summon minecraft:zombie'),
      ),
    ).toBe(true);
    expect((await state()).jobs.filter((j) => j.ruleId === rule.id)).toHaveLength(1);
    await expect(overlay.getByRole('alert')).toHaveCount(0);
    for (let i = 0; i < 4; i++) await request({ op: 'previewSound', file: sound, volume: 0.1 });
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'audioStats').ended)).toBe(5);
    expect(await page.evaluate(() => Reflect.get(window, 'audioStats').max)).toBe(1);
    await page.getByRole('button', { name: 'Racha x1', exact: true }).click();
    await expect(overlay.getByRole('alert')).toHaveCount(1);
    await request({ op: 'stopEvents' });
    await expect(overlay.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Racha x2', exact: true }).click();
    await expect(overlay.getByRole('alert')).toHaveCount(0);
    expect((await state()).dryRun).toBe(true);
    expect(errors).toEqual([]);
    // Windows native capture enumeration is a separate check from DOM screenshots.
    const capture = await app.evaluate(async ({ desktopCapturer }) =>
      (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 480, height: 854 } }))
        .filter((s) => s.name.includes('LiveForge'))
        .map((s) => ({ name: s.name, id: s.id, empty: s.thumbnail.isEmpty() })),
    );
    expect(capture.some((s) => s.name === 'LiveForge Overlay v0.2' && !s.empty)).toBe(true);
    await writeFile('work/v02/capture-enumeration.json', JSON.stringify({ properties, capture }, null, 2));
  } finally {
    await app.close();
  }
});
