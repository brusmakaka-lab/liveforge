import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Request } from '../../src/shared/api';
import { simulationSchema } from '../../src/providers/simulator';
const require = createRequire(import.meta.url);

test('v0.4 Studio → loopback browser HUD/alerts → Simulator streak → persisted restart', async () => {
  await mkdir('work/v04', { recursive: true });
  const profile = await mkdtemp(resolve('work/v04/e2e-'));
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.LIVEFORGE_DATA_DIR = profile;
  const exe = process.env.LIVEFORGE_TEST_EXE;
  const launch = () =>
    electron.launch({
      executablePath: exe ?? (require('electron') as string),
      args: exe ? [] : [resolve('out/main/index.js')],
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' })).toBeVisible();
    const req = (input: Request) => page.evaluate((input) => window.liveforge.request(input), input);
    const state = async () => {
      const r = await req({ op: 'snapshot' });
      if (!r.ok || !r.snapshot) throw Error('state');
      return r.snapshot;
    };
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
    const active = (await state()).settings.activePresetId;
    await page.getByRole('button', { name: 'Overlay Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Crear preset Bedrock' }).click();
    await expect.poll(async () => (await state()).presets.length).toBe(2);
    expect((await state()).settings.activePresetId).toBe(active);
    const preset = (await state()).presets.find((p) => p.name === 'Bedrock Interactive v1')!;
    expect((await req({ op: 'activatePreset', id: preset.id })).ok).toBe(true);
    await page.getByRole('switch', { name: 'Servidor local', exact: true }).click();
    await page.getByLabel('Puerto local', { exact: true }).fill(String(port));
    await page.getByRole('button', { name: 'Guardar Studio / reintentar' }).click();
    await expect.poll(async () => (await state()).overlayHttp?.state).toBe('ONLINE');
    const base = `http://127.0.0.1:${port}`;
    const openBrowser = async (url: string) => {
      const promise = app.waitForEvent('window');
      await app.evaluate(async ({ BrowserWindow }, url) => {
        const w = new BrowserWindow({
          width: 1100,
          height: 900,
          show: true,
          focusable: false,
          webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
        });
        await w.loadURL(url);
      }, url);
      return promise;
    };
    const hud = await openBrowser(base + '/overlay/hud');
    const errors: string[] = [];
    hud.on('pageerror', (e) => errors.push(e.message));
    await hud.route('https://**/*', (r) => r.abort());
    await expect(hud.locator('.hud-card')).toHaveCount(16);
    expect(await hud.evaluate(() => typeof window.liveforge)).toBe('undefined');
    expect(await hud.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(await hud.locator('.hud-canvas').evaluate((e) => [e.clientWidth, e.clientHeight])).toEqual([
      1080, 1920,
    ]);
    expect((await hud.locator('.hud-card').first().boundingBox())!.height).toBeGreaterThan(50);
    const publicState = await (await fetch(base + '/overlay/state.json')).text();
    expect(publicState).not.toMatch(/execute as|weather2|rconPassword|minecraftConnection|rawEvents/);
    const rose = (await state()).rules.find((r) => r.presetId === preset.id && r.publicLabel === 'ZOMBIE')!;
    await page.getByLabel(`Etiqueta ${rose.name}`, { exact: true }).fill('ZOMBIE PÚBLICO');
    await page.getByLabel(`Etiqueta ${rose.name}`, { exact: true }).press('Tab');
    await expect(hud.locator(`[data-hud-id="${rose.id}"]`)).toContainText('ZOMBIE PÚBLICO');
    await page.getByRole('switch', { name: `HUD ${rose.name}`, exact: true }).click();
    await expect(hud.locator('.hud-card')).toHaveCount(15);
    await page.getByRole('switch', { name: `HUD ${rose.name}`, exact: true }).click();
    await expect(hud.locator('.hud-card')).toHaveCount(16);
    await page.locator('main.content').evaluate((e) => e.scrollTo(0, 0));
    await page.screenshot({ path: 'work/v04/studio.png' });
    await hud.screenshot({ path: 'work/v04/hud.png', omitBackground: true });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('file:'))!
        .setSize(1050, 720);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(1050);
    await page.getByRole('button', { name: 'Overlay Studio', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Overlay Studio', exact: true })).toBeVisible();
    await page.screenshot({ path: 'work/v04/studio-minimum.png' });
    const edited = { ...(await state()).rules.find((r) => r.id === rose.id)!, showStreakProgress: true };
    expect((await req({ op: 'saveRule', rule: edited })).ok).toBe(true);
    const alerts = await openBrowser(base + '/overlay/alerts');
    alerts.on('pageerror', (e) => errors.push(e.message));
    await req({ op: 'startEvents' });
    let alertId: string | null = null;
    for (const quantity of [1, 2, 5]) {
      await req({
        op: 'simulate',
        event: simulationSchema.parse({
          type: 'GIFT',
          giftName: 'Rose',
          quantity,
          repeatEnd: false,
          streakId: 'v04-streak',
        }),
      });
      await expect(alerts.getByRole('alert')).toHaveCount(1);
      await expect(alerts.locator('.gift-count')).toHaveText(`×${quantity}`);
      if (quantity === 1) alertId = await alerts.getByRole('alert').getAttribute('data-alert-id');
      else expect(await alerts.getByRole('alert').getAttribute('data-alert-id')).toBe(alertId);
    }
    await req({
      op: 'simulate',
      event: simulationSchema.parse({
        type: 'GIFT',
        giftName: 'Rose',
        quantity: 5,
        repeatEnd: true,
        streakId: 'v04-streak',
      }),
    });
    await expect(alerts.getByRole('alert')).toHaveCount(1);
    expect(await alerts.getByRole('alert').getAttribute('data-alert-id')).toBe(alertId);
    await expect
      .poll(async () => (await state()).jobs.find((j) => j.ruleId === rose.id)?.status)
      .toBe('COMPLETED');
    expect(
      (await state()).logs.filter(
        (l) => l.message.includes('[DRY RUN]') && l.message.includes('summon minecraft:zombie'),
      ),
    ).toHaveLength(5);
    expect((await state()).publicOverlay?.items.every((i) => i.price === undefined)).toBe(true);
    const future = (await state()).rules.find((r) => r.availability === 'REQUIRES_MOD')!;
    expect((await req({ op: 'testRule', id: future.id })).ok).toBe(false);
    await req({ op: 'stopEvents' });
    await expect(alerts.getByRole('alert')).toHaveCount(0);
    const settings = (await state()).settings.overlayStudio!;
    await req({ op: 'saveStudio', settings: { ...settings, enabled: false } });
    await expect(hud.locator('.hud-card')).toHaveCount(0);
    await req({ op: 'saveStudio', settings });
    await expect(hud.locator('.hud-card')).toHaveCount(16);
    expect(errors).toEqual([]);
    // Close all test-only web windows before the normal desktop shutdown.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => w.webContents.getURL().startsWith('http:'))
        .forEach((w) => w.close()),
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' })).toBeVisible();
    await expect.poll(async () => (await state()).overlayHttp?.state).toBe('ONLINE');
    expect((await state()).settings.activePresetId).toBe(preset.id);
    expect((await state()).rules.find((r) => r.id === rose.id)?.publicLabel).toBe('ZOMBIE PÚBLICO');
    expect((await state()).publicOverlay?.alerts).toHaveLength(0);
    expect((await fetch(base + '/overlay/hud')).status).toBe(200);
  } finally {
    await app.close();
  }
});
