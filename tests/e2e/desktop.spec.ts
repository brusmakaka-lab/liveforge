import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startRconServer } from '../support/rcon-server';
import type { Snapshot } from '../../src/shared/model';

const require = createRequire(import.meta.url);
const launch = async (dataDir: string): Promise<ElectronApplication> => {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  env.LIVEFORGE_DATA_DIR = dataDir;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    executablePath: require('electron') as string,
    args: [resolve('out/main/index.js')],
    env,
    timeout: 30_000,
  });
};
const state = async (page: Page): Promise<Snapshot> =>
  page.evaluate(async () => {
    const reply = await window.liveforge.request({ op: 'snapshot' });
    if (!reply.ok || !reply.snapshot) throw new Error('No state');
    return reply.snapshot;
  });

test('MVP desktop flow: SQLite → UI → simulator → engine → queue → RCON → restart', async () => {
  await mkdir('work', { recursive: true });
  await mkdir('docs/screenshots', { recursive: true });
  const dataDir = await mkdtemp(resolve('work/e2e-profile-'));
  const server = await startRconServer();
  let app = await launch(dataDir);
  const errors: string[] = [];
  try {
    let page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' })).toBeVisible();
    await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('TikTok username').fill('example_creator');
    await page.getByLabel('RCON port').fill(String(server.port));
    await page.getByLabel('RCON password').fill(server.password);
    await page.getByRole('button', { name: 'Guardar y probar conexión' }).click();
    await expect.poll(async () => (await state(page)).game.state).toBe('CONNECTED');
    await expect.poll(async () => server.commands).toContain('list');
    const database = await readFile(join(dataDir, 'liveforge.sqlite'));
    expect(database.includes(Buffer.from(server.password))).toBe(false);
    await page.screenshot({ path: 'docs/screenshots/settings.png', fullPage: true });
    await page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
    await page.getByLabel('Nombre de nuevo preset').fill('Validation preset');
    await page.getByRole('button', { name: 'Crear preset', exact: true }).click();
    await page.getByRole('button', { name: 'Activar', exact: true }).click();
    await page.getByRole('button', { name: 'Nueva regla', exact: true }).click();
    await page.getByLabel('Nombre de la regla').fill('Rose zombie sequence');
    await page
      .getByLabel('Comando Minecraft', { exact: true })
      .fill('execute as {{player}} at @s run summon minecraft:zombie ~ ~ ~');
    await page.getByLabel('Repeticiones', { exact: true }).fill('3');
    await page.getByLabel('Intervalo (ms)', { exact: true }).fill('50');
    await page.getByLabel('Delay antes (ms)', { exact: true }).fill('30');
    await page.getByRole('button', { name: 'SAVE RULE', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeVisible();
    await page.screenshot({ path: 'docs/screenshots/rule-editor.png', fullPage: true });
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'START EVENTS', exact: true }).click();
    await page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
    await page.getByRole('button', { name: /Rose zombie sequence/ }).click();
    await page.getByRole('button', { name: 'TEST', exact: true }).last().click();
    await expect.poll(async () => (await state(page)).executed).toBe(1);
    expect(server.commands).toEqual(['list']);
    expect(
      (await state(page)).logs.some((l) => l.message.includes('[DRY RUN]') && l.message.includes('Ainztk58')),
    ).toBe(true);
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('switch', { name: 'DRY RUN', exact: true }).click();
    await page.getByRole('button', { name: 'Simulator', exact: true }).click();
    await page.getByRole('button', { name: 'Simular evento', exact: true }).click();
    await expect
      .poll(async () => server.commands.filter((c) => c.includes('summon minecraft:zombie')).length)
      .toBe(3);
    await expect.poll(async () => (await state(page)).executed).toBe(2);
    await page.screenshot({ path: 'docs/screenshots/simulator.png', fullPage: true });
    await page.getByRole('button', { name: 'STOP ALL EVENTS', exact: true }).click();
    await page.getByRole('button', { name: 'Simular evento', exact: true }).click();
    await expect.poll(async () => (await state(page)).session.eventsReceived).toBe(2);
    expect(server.commands.filter((c) => c.includes('summon minecraft:zombie'))).toHaveLength(3);
    await page.getByRole('button', { name: 'Logs / Diagnostics', exact: true }).click();
    await page.getByRole('button', { name: 'Copy diagnostics', exact: true }).click();
    const diagnostics = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(diagnostics).toContain('Rose zombie sequence');
    expect(diagnostics).not.toContain(server.password);
    await page.screenshot({ path: 'docs/screenshots/diagnostics.png', fullPage: true });
    await page.getByRole('button', { name: 'Command library', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tornado F1', exact: true })).toBeVisible();
    await app.close();
    app = await launch(dataDir);
    page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' })).toBeVisible();
    const reopened = await state(page);
    expect(reopened.settings.tiktokUsername).toBe('example_creator');
    expect(reopened.rules.some((r) => r.name === 'Rose zombie sequence')).toBe(true);
    expect(reopened.hasPassword).toBe(true);
    expect(reopened.dryRun).toBe(true);
    expect(reopened.eventsEnabled).toBe(false);
    expect(reopened.jobs).toHaveLength(0);
    await page.getByRole('button', { name: 'CONNECT', exact: true }).click();
    await expect.poll(async () => (await state(page)).game.state).toBe('CONNECTED');
    const rejected = await page.evaluate(async () =>
      window.liveforge.request({
        op: 'saveSettings',
        settings: {
          ...((await window.liveforge.request({ op: 'snapshot' })) as { snapshot: Snapshot }).snapshot
            .settings,
          player: '@a',
        },
      }),
    );
    expect(rejected.ok).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await server.close();
  }
});
