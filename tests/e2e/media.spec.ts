import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { newAction, newRule } from '../../src/shared/defaults';
import type { Request } from '../../src/shared/api';
import type { AlertView } from '../../src/shared/media';
const require = createRequire(import.meta.url);

test('real WAV/MP3 preview and rule playback, volume, mute, decoding failure continues Minecraft', async () => {
  test.skip(
    !process.env.LIVEFORGE_TEST_WAV || !process.env.LIVEFORGE_TEST_MP3,
    'Provide local WAV and MP3 fixtures',
  );
  await mkdir('work/audio-diagnosis', { recursive: true });
  const profile = await mkdtemp(resolve('work/audio-diagnosis/e2e-'));
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, LIVEFORGE_DATA_DIR: profile }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: require('electron') as string,
    args: [resolve('out/main/index.js')],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' }).waitFor();
    const request = (input: Request) => page.evaluate((input) => window.liveforge.request(input), input);
    const snapshot = async () => {
      const r = await request({ op: 'snapshot' });
      if (!r.ok || !r.snapshot) throw Error('No snapshot');
      return r.snapshot;
    };
    const initial = await snapshot();
    await request({
      op: 'saveSettings',
      settings: { ...initial.settings, audio: { volume: 0.5, mute: false } },
    });
    await page.evaluate(() => {
      const records: { volume: number; playing: boolean; ended: boolean; error?: string }[] = [];
      Reflect.set(window, 'playbackRecords', records);
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const record = {
          volume: this.volume,
          playing: false,
          ended: false,
          error: undefined as string | undefined,
        };
        records.push(record);
        this.addEventListener('playing', () => {
          record.playing = true;
        });
        this.addEventListener('ended', () => {
          record.ended = true;
        });
        return original.call(this).catch((error: unknown) => {
          record.error = String(error);
          throw error;
        });
      };
    });
    let expected = 0;
    for (const file of [process.env.LIVEFORGE_TEST_WAV!, process.env.LIVEFORGE_TEST_MP3!]) {
      const rule = {
        ...newRule(initial.settings.activePresetId),
        name: `Audio ${++expected}`,
        actions: [{ ...newAction('PlaySound'), type: 'PlaySound' as const, file, volume: 0.4 }, newAction()],
      };
      await request({ op: 'saveRule', rule });
      await page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(rule.name) }).click();
      await page.getByRole('button', { name: 'Probar sonido', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () => Reflect.get(window, 'playbackRecords').filter((r: { ended: boolean }) => r.ended).length,
          ),
        )
        .toBe(expected);
      await request({ op: 'startEvents' });
      await page.getByRole('button', { name: 'TEST', exact: true }).click();
      expected++;
      await expect
        .poll(() =>
          page.evaluate(
            () => Reflect.get(window, 'playbackRecords').filter((r: { ended: boolean }) => r.ended).length,
          ),
        )
        .toBe(expected);
      expect((await snapshot()).logs.some((l) => l.message.includes('[DRY RUN]'))).toBe(true);
    }
    const records = await page.evaluate(() => Reflect.get(window, 'playbackRecords'));
    expect(records).toHaveLength(4);
    for (const record of records) expect(record).toMatchObject({ playing: true, ended: true, volume: 0.2 });
    await request({
      op: 'saveSettings',
      settings: { ...initial.settings, audio: { volume: 0.5, mute: true } },
    });
    await page.getByRole('button', { name: 'Probar sonido', exact: true }).click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => Reflect.get(window, 'playbackRecords').length)).toBe(4);
    await request({
      op: 'saveSettings',
      settings: { ...initial.settings, audio: { volume: 1, mute: false } },
    });
    await page.getByRole('button', { name: 'Probar sonido', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => Reflect.get(window, 'playbackRecords').filter((r: { ended: boolean }) => r.ended).length,
        ),
      )
      .toBe(5);
    expect(await page.evaluate(() => Reflect.get(window, 'playbackRecords')[4].volume)).toBe(0.4);
    const invalid = join(profile, 'invalid.wav');
    await writeFile(invalid, 'invalid WAV');
    const broken = {
      ...newRule(initial.settings.activePresetId),
      actions: [
        { ...newAction('PlaySound'), type: 'PlaySound' as const, file: invalid, volume: 1 },
        newAction(),
      ],
    };
    await request({ op: 'saveRule', rule: broken });
    await request({ op: 'testRule', id: broken.id });
    await expect
      .poll(async () => (await snapshot()).jobs.find((j) => j.ruleId === broken.id)?.status)
      .toBe('COMPLETED');
    await expect
      .poll(async () =>
        (await snapshot()).logs.some(
          (l) =>
            l.category === 'AUDIO' && l.message.includes('invalid.wav') && l.message.includes('"code":4'),
        ),
      )
      .toBe(true);
    await writeFile(
      'work/audio-diagnosis/validation.json',
      JSON.stringify({ playback: records, mute: true, unmute: true, failedAudioJobCompleted: true }, null, 2),
    );
  } finally {
    await app.close();
  }
});

test('custom image import, full restart persistence, replacement, gift priority and fallback', async () => {
  await mkdir('work/audio-diagnosis', { recursive: true });
  const profile = await mkdtemp(resolve('work/audio-diagnosis/image-'));
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, LIVEFORGE_DATA_DIR: profile }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      executablePath: require('electron') as string,
      args: [resolve('out/main/index.js')],
      env,
    });
  let app = await launch();
  const mainPage = async () => {
    // With a persisted visible overlay either window can finish loading first.
    await expect.poll(() => app.windows().some((w) => w.url().endsWith('/index.html'))).toBe(true);
    return app.windows().find((w) => w.url().endsWith('/index.html'))!;
  };
  try {
    let page = await mainPage();
    await page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' }).waitFor();
    const imagePath = join(profile, 'image.png');
    const png = await app.evaluate(({ nativeImage }) =>
      nativeImage
        .createFromBitmap(Buffer.alloc(600 * 300 * 4, 255), { width: 600, height: 300 })
        .toPNG()
        .toString('base64'),
    );
    await writeFile(imagePath, Buffer.from(png, 'base64'));
    // Stub only the OS file picker; use the real image importer, IPC, rule storage and renderer.
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, imagePath);
    await page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
    await page.getByRole('button', { name: /B · Rose → Tornado F1/ }).click();
    await page.getByRole('button', { name: 'Añadir acción', exact: true }).click();
    await page.getByLabel('Tipo de acción 2').selectOption('ShowAlert');
    await page.getByRole('button', { name: 'Elegir imagen personalizada', exact: true }).click();
    const preview = page.getByAltText('Preview de imagen personalizada');
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(256);
    await page.getByRole('button', { name: 'SAVE RULE', exact: true }).click();
    await page.getByRole('button', { name: 'Previsualizar alerta', exact: true }).click();
    await expect(page.locator('.gift-art img')).toBeVisible();
    const saved = await page.evaluate(async () => {
      const r = await window.liveforge.request({ op: 'snapshot' });
      return r.ok
        ? r.snapshot?.rules.flatMap((r) => r.actions).find((a) => a.type === 'ShowAlert')
        : undefined;
    });
    expect(saved?.type === 'ShowAlert' && saved.customImage?.startsWith('data:image/png;base64,')).toBe(true);
    if (saved?.type !== 'ShowAlert') throw Error('ShowAlert was not saved');
    const customImage = saved.customImage!;
    // The real ShowAlert action handler must carry the image too, not only previewAlert.
    await page.evaluate(() => window.liveforge.request({ op: 'stopEvents' }));
    await page.evaluate(() => window.liveforge.request({ op: 'startEvents' }));
    await page.getByRole('button', { name: 'TEST', exact: true }).click();
    await expect(page.locator('.gift-art img')).toHaveAttribute('src', customImage);
    await page.evaluate(() => window.liveforge.request({ op: 'stopEvents' }));
    await app.close();
    app = await launch();
    page = await mainPage();
    await page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' }).waitFor();
    await page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
    await page.getByRole('button', { name: /B · Rose → Tornado F1/ }).click();
    await expect(page.getByAltText('Preview de imagen personalizada')).toBeVisible();
    await expect(page.getByAltText('Preview de imagen personalizada')).toHaveAttribute('src', customImage);
    // Cancellation preserves the current selection.
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    await page.getByRole('button', { name: 'Reemplazar imagen personalizada', exact: true }).click();
    await expect(page.getByAltText('Preview de imagen personalizada')).toHaveAttribute('src', customImage);
    const replacementPath = join(profile, 'replacement.png');
    const replacement = await app.evaluate(({ nativeImage }) =>
      nativeImage
        .createFromBitmap(Buffer.from([255, 0, 0, 255]), { width: 1, height: 1 })
        .toPNG()
        .toString('base64'),
    );
    await writeFile(replacementPath, Buffer.from(replacement, 'base64'));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, replacementPath);
    await page.getByRole('button', { name: 'Reemplazar imagen personalizada', exact: true }).click();
    await expect(page.getByAltText('Preview de imagen personalizada')).toBeVisible();
    await expect(page.getByAltText('Preview de imagen personalizada')).not.toHaveAttribute(
      'src',
      customImage,
    );
    await page.getByRole('button', { name: 'SAVE RULE', exact: true }).click();
    // Exercise presentation of a normalized gift image over the same real IPC used by the runtime.
    // No real TikTok connection/catalog requests: serve the gift fixture locally in this test.
    await page.evaluate(() =>
      window.liveforge.request({ op: 'overlay', visible: true, locked: true, x: 40, y: 40 }),
    );
    await expect.poll(() => app.windows().length).toBe(2);
    const overlay = app.windows().find((w) => w !== page)!;
    await overlay.waitForURL('**#overlay');
    const giftUrl = 'https://p16.tiktokcdn.com/liveforge-test.png';
    await overlay.route(giftUrl, (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }),
    );
    const alert: AlertView = {
      id: 'priority',
      username: 'testuser',
      giftName: 'Rose',
      quantity: 1,
      image: giftUrl,
      customImage,
      icon: '🌹',
      impact: 'NORMAL',
      activeStreak: false,
      text: 'Image priority',
      expiresAt: Date.now() + 60_000,
      leaving: false,
    };
    const send = (alerts: AlertView[]) =>
      app.evaluate(({ BrowserWindow }, alerts) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().endsWith('#overlay'))!
          .webContents.send('liveforge:media', { type: 'alerts', alerts });
      }, alerts);
    await send([alert]);
    await expect(overlay.locator('.gift-art img')).toHaveAttribute('src', giftUrl);
    await expect
      .poll(() => overlay.locator('.gift-art img').evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(600);
    await send([{ ...alert, image: undefined }]);
    await expect(overlay.locator('.gift-art img')).toHaveAttribute('src', customImage);
    const brokenUrl = 'https://p16.tiktokcdn.com/liveforge-missing.png';
    await overlay.route(brokenUrl, (route) => route.fulfill({ status: 404, body: 'missing' }));
    await send([{ ...alert, image: brokenUrl }]);
    await expect(overlay.locator('.gift-art img')).toHaveAttribute('src', customImage);
    await send([{ ...alert, image: undefined, customImage: undefined }]);
    await expect(overlay.locator('.gift-art img')).toHaveCount(0);
    await expect(overlay.locator('.gift-art')).toHaveText('🌹');
    await send([{ ...alert, image: undefined, customImage: 'data:image/png;base64,bm90LXBuZw==' }]);
    await expect(overlay.locator('.gift-art')).toHaveText('🌹');
    await page.screenshot({ path: 'work/audio-diagnosis/custom-image-editor.png' });
    await page.getByRole('button', { name: 'Quitar imagen personalizada', exact: true }).click();
    await expect(page.getByAltText('Preview de imagen personalizada')).toHaveCount(0);
    await page.getByRole('button', { name: 'SAVE RULE', exact: true }).click();
    await app.close();
    app = await launch();
    page = await mainPage();
    await page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' }).waitFor();
    await page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
    await page.getByRole('button', { name: /B · Rose → Tornado F1/ }).click();
    await expect(page.getByAltText('Preview de imagen personalizada')).toHaveCount(0);
    await page.getByRole('button', { name: 'Previsualizar alerta', exact: true }).click();
    await expect(page.locator('.gift-art')).toHaveText('🎁');
  } finally {
    await app.close();
  }
});
