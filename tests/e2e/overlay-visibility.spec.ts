import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expectRenderedOverlay } from '../support/overlay-visibility';
const require = createRequire(import.meta.url);

test('fresh profile reproduces empty overlay; configuring ShowAlert + progress renders one visible card through UI', async () => {
  await mkdir('work/overlay-diagnosis', { recursive: true });
  const profile = await mkdtemp(resolve('work/overlay-diagnosis/e2e-'));
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
    await page.getByRole('button', { name: 'Simulator', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir overlay', exact: true }).click();
    await expect.poll(() => app.windows().length).toBe(2);
    const overlay = app.windows().find((w) => w !== page)!;
    await expect.poll(() => overlay.url()).toContain('#overlay');
    overlay.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: 'START EVENTS', exact: true }).click();
    await page.getByRole('button', { name: 'Racha x1', exact: true }).click();
    const initial = await page.evaluate(async () => window.liveforge.request({ op: 'snapshot' }));
    if (!initial.ok || !initial.snapshot) throw Error('No snapshot');
    expect(initial.snapshot.session.eventsReceived).toBe(1);
    expect(initial.snapshot.dryRun).toBe(true);
    const rose = initial.snapshot.rules.find((r) => r.name === 'B · Rose → Tornado F1')!;
    expect(rose.enabled).toBe(true);
    expect(rose.showStreakProgress).toBeUndefined();
    expect(rose.actions.map((a) => a.type)).toEqual(['MinecraftCommand']);
    expect(await overlay.evaluate(() => window.liveforge.request({ op: 'mediaReady' }))).toMatchObject({
      ok: true,
      alerts: [],
    });
    await expect(overlay.getByRole('alert')).toHaveCount(0);
    // Configure only the isolated test profile, entirely through the shipped editor.
    await page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
    await page.getByRole('button', { name: /B · Rose → Tornado F1/ }).click();
    await page.getByRole('button', { name: 'Añadir acción', exact: true }).click();
    await page.getByLabel('Tipo de acción 2', { exact: true }).selectOption('ShowAlert');
    await page
      .getByLabel('Texto de la alerta', { exact: true })
      .fill('@{{username}} envió {{giftName}} x{{giftCount}}');
    await page.getByLabel('Duración de alerta (ms)', { exact: true }).fill('5000');
    await page.getByRole('switch', { name: 'Mostrar progreso desde el primer regalo', exact: true }).click();
    await page.getByRole('button', { name: 'SAVE RULE', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Simulator', exact: true }).click();
    await page.getByRole('button', { name: 'Racha x1', exact: true }).click();
    const rendered = await expectRenderedOverlay(app, overlay);
    await expect(overlay.getByRole('alert')).toContainText('@testuser envió Rose x1');
    const state = await page.evaluate(() => window.liveforge.request({ op: 'mediaReady' }));
    const delivered = await overlay.evaluate(() => window.liveforge.request({ op: 'mediaReady' }));
    expect(delivered).toEqual(state);
    await overlay.screenshot({ path: 'work/overlay-diagnosis/configured-x1.png', omitBackground: true });
    await writeFile(
      'work/overlay-diagnosis/visibility.json',
      JSON.stringify({ profile, defaultProfileAlerts: 0, configuredAlerts: 1, ...rendered }, null, 2),
    );
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
