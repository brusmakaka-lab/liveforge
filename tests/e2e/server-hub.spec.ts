import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { newRule, newAction } from '../../src/shared/defaults';
import type { Request } from '../../src/shared/api';
import type { Rule } from '../../src/shared/model';
const require = createRequire(import.meta.url);
async function profile() {
  await mkdir('work/hub-e2e/screenshots', { recursive: true });
  return mkdtemp(resolve('work/hub-e2e/profile-'));
}
async function launch(data: string) {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, LIVEFORGE_DATA_DIR: data }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: require('electron') as string,
    args: [resolve('out/main/index.js')],
    env,
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' })).toBeVisible();
  return { app, page, request: (r: Request) => page.evaluate((r) => window.liveforge.request(r), r) };
}
async function scripts(root: string) {
  const fixture = resolve('tests/fixtures/server.mjs');
  for (const [name, extra] of [
    ['start server.cmd', ''],
    ['fail.cmd', '--fail'],
    ['timeout.cmd', '--wait-release'],
  ])
    await writeFile(
      join(root, name!),
      `@echo off\r\n"${process.execPath}" "${fixture}" ${extra}\r\n`,
      'utf8',
    );
  await writeFile(join(root, 'server.properties'), 'motd=fixture\n');
}

test('gift UI persists quantity, routes Simulator, positions new editors and all Control Room pages', async () => {
  const data = await profile();
  let h = await launch(data);
  try {
    const initial = await h.request({ op: 'snapshot' });
    if (!initial.ok || !initial.snapshot) throw Error('snapshot');
    for (const rule of initial.snapshot.rules)
      await h.request({ op: 'saveRule', rule: { ...rule, enabled: false } });
    const rule: Rule = {
      ...newRule(initial.snapshot.settings.activePresetId),
      name: 'QA cantidad Donut',
      trigger: { type: 'GIFT', giftId: '', giftName: 'Donut', mode: 'STREAK_END' },
      actions: [{ ...newAction(), type: 'MinecraftCommand', command: 'say cantidad' }],
    };
    await h.request({ op: 'saveRule', rule });
    const other = {
      ...rule,
      id: crypto.randomUUID(),
      name: 'QA siguiente',
      enabled: false,
      actions: [newAction()],
    };
    await h.request({ op: 'saveRule', rule: other });
    await h.page.getByRole('button', { name: 'Presets y reglas', exact: true }).click();
    await h.page.getByRole('button', { name: /^QA cantidad Donut Gift|^QA cantidad Donut Donut/ }).click();
    await h.page.getByLabel('Respuesta a cantidad de regalos').selectOption('PER_ITEM');
    await h.page.getByLabel('Intervalo por cantidad (ms)').fill('25');
    await h.page.getByLabel('Máximo de ejecuciones').fill('5');
    await h.page.getByLabel('Gift name', { exact: true }).fill('  DONUT  ');
    await h.page.getByRole('button', { name: 'SAVE RULE', exact: true }).click();
    await h.page.locator('.content').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await h.page.getByRole('button', { name: /^QA siguiente/ }).click();
    await expect(h.page.getByLabel('Nombre de la regla')).toHaveValue('QA siguiente');
    const offsets = await h.page
      .locator('.rule-editor')
      .evaluate((el) => ({
        top: el.getBoundingClientRect().top,
        content: el.closest('.content')!.getBoundingClientRect().top,
      }));
    expect(offsets.top - offsets.content).toBeGreaterThanOrEqual(0);
    expect(offsets.top - offsets.content).toBeLessThan(30);
    await h.request({ op: 'startEvents' });
    await h.page.getByRole('button', { name: 'Simulator', exact: true }).click();
    await expect.poll(() => h.page.locator('.content').evaluate((el) => el.scrollTop)).toBe(0);
    await h.page.getByLabel('Gift name', { exact: true }).fill('Donut');
    await h.page.getByLabel('Gift ID', { exact: true }).fill('');
    for (const n of [1, 2, 5]) await h.page.getByRole('button', { name: `Racha x${n}`, exact: true }).click();
    const before = await h.request({ op: 'snapshot' });
    expect(before.ok && before.snapshot?.jobs).toHaveLength(0);
    await h.page.getByRole('button', { name: 'Finalizar racha', exact: true }).click();
    await expect
      .poll(async () => {
        const r = await h.request({ op: 'snapshot' });
        return r.ok && r.snapshot?.jobs[0]?.status;
      })
      .toBe('COMPLETED');
    const result = await h.request({ op: 'snapshot' });
    if (!result.ok || !result.snapshot) throw Error();
    expect(
      result.snapshot.logs.filter(
        (l) => l.message.includes('[DRY RUN]') && l.message.includes('say cantidad'),
      ),
    ).toHaveLength(5);
    await h.app.close();
    h = await launch(data);
    const persisted = await h.request({ op: 'snapshot' });
    if (!persisted.ok || !persisted.snapshot) throw Error();
    expect(persisted.snapshot.rules.find((r) => r.id === rule.id)!.actions[0]!.giftQuantity).toEqual({
      mode: 'PER_ITEM',
      interval: 25,
      maxExecutions: 5,
    });
    await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1050, 720));
    const screens = [
      'Dashboard',
      'Presets y reglas',
      'Command library',
      'Simulator',
      'Logs / Diagnostics',
      'Settings',
      'Minecraft Server Hub',
    ];
    await mkdir('work/hub-e2e/screenshots', { recursive: true });
    for (const [i, name] of screens.entries()) {
      await h.page.getByRole('button', { name, exact: true }).click();
      await expect.poll(() => h.page.locator('.content').evaluate((el) => el.scrollTop)).toBe(0);
      expect(await h.page.locator('.content').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(
        true,
      );
      await h.page.screenshot({ path: `work/hub-e2e/screenshots/${i}.png` });
      await h.page.locator('.content').evaluate((el) => (el.scrollTop = el.scrollHeight));
    }
    await h.page.locator('.sidebar .version').scrollIntoViewIfNeeded();
    const sidebar = await h.page.locator('.sidebar').evaluate((el) => ({
      bottom: el.getBoundingClientRect().bottom,
      versionBottom: el.querySelector('.version')!.getBoundingClientRect().bottom,
      overflow: getComputedStyle(el).overflowY,
      alignment: getComputedStyle(el.querySelector('nav button')!).textAlign,
    }));
    expect(sidebar.overflow).toBe('auto');
    expect(sidebar.alignment).toBe('left');
    // Windows display scaling rounds scroll offsets to physical pixels.
    expect(sidebar.versionBottom).toBeLessThanOrEqual(sidebar.bottom + 1);
    await h.page.screenshot({ path: 'work/hub-e2e/screenshots/sidebar-bottom.png' });
    await h.page.getByRole('button', { name: 'Command library', exact: true }).click();
    await h.page.locator('.command-tile').last().click();
    await expect(h.page.getByLabel('Nombre del comando')).toBeInViewport();
  } finally {
    await h.app.close();
  }
});

test('Server Hub Windows script: select, persist, start, console, restart, safe close and startup failure', async () => {
  const data = await profile();
  const root = join(data, 'server folder');
  await mkdir(root);
  await scripts(root);
  let h = await launch(data);
  try {
    await h.page.getByRole('button', { name: 'Minecraft Server Hub', exact: true }).click();
    await h.app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
    }, root);
    await h.page.getByRole('button', { name: 'Elegir carpeta', exact: true }).click();
    await expect(h.page.getByLabel('Archivo de inicio')).toContainText('start server.cmd');
    await h.page.getByLabel('Archivo de inicio').selectOption('start server.cmd');
    await h.page.getByRole('button', { name: 'Guardar servidor', exact: true }).click();
    await expect(h.page.getByRole('button', { name: 'Iniciar servidor', exact: true })).toBeEnabled();
    await expect(h.page.getByRole('button', { name: 'mods', exact: true })).toBeDisabled();
    await expect(h.page.getByRole('button', { name: 'plugins', exact: true })).toBeDisabled();
    await expect(h.page.getByRole('button', { name: 'server.properties', exact: true })).toBeEnabled();
    // Check dispatch to the OS shell without opening Explorer in the test runner.
    await h.app.evaluate(({ shell }) => {
      shell.showItemInFolder = (path) => {
        Reflect.set(globalThis, 'hubOpenedPath', path);
      };
    });
    await h.page.getByRole('button', { name: 'server.properties', exact: true }).click();
    expect(await h.app.evaluate(() => Reflect.get(globalThis, 'hubOpenedPath'))).toBe(
      join(root, 'server.properties'),
    );
    await h.page.getByRole('button', { name: 'Iniciar servidor', exact: true }).click();
    await expect(h.page.getByRole('status').filter({ hasText: /^ONLINE$/ })).toBeVisible();
    const status = await h.request({ op: 'serverStatus' });
    if (!status.ok) throw Error();
    const pid = status.server!.pid;
    await h.page.getByLabel('Comando de consola', { exact: true }).fill('list');
    await h.page.getByRole('button', { name: 'Enviar comando', exact: true }).click();
    await expect(h.page.getByRole('log')).toContainText('received: list');
    await h.page.getByLabel('Autoscroll').uncheck();
    await h.page.getByRole('button', { name: 'Reiniciar servidor', exact: true }).click();
    await expect
      .poll(async () => {
        const r = await h.request({ op: 'serverStatus' });
        return r.ok && r.server?.pid !== pid && r.server?.state === 'ONLINE';
      })
      .toBe(true);
    await h.page.getByRole('button', { name: 'Detener servidor', exact: true }).click();
    await expect(h.page.getByRole('status').filter({ hasText: /^OFFLINE$/ })).toBeVisible();
    await h.page.getByRole('button', { name: 'Iniciar servidor', exact: true }).click();
    await expect(h.page.getByRole('status').filter({ hasText: /^ONLINE$/ })).toBeVisible();
    await h.app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
      BrowserWindow.getAllWindows()[0]!.close();
    });
    await expect(h.page.getByRole('heading', { name: 'Minecraft Server Hub.' })).toBeVisible();
    expect(await h.request({ op: 'serverStatus' })).toMatchObject({
      ok: true,
      server: { active: true, state: 'ONLINE' },
    });
    await h.app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      setTimeout(() => BrowserWindow.getAllWindows()[0]!.close(), 20);
    });
    await h.app.waitForEvent('close');
    h = await launch(data);
    const saved = await h.request({ op: 'snapshot' });
    expect(saved.ok && saved.snapshot?.settings.localServer).toMatchObject({
      root,
      entry: 'start server.cmd',
    });
    expect(await h.request({ op: 'serverStatus' })).toMatchObject({
      ok: true,
      server: { active: false, state: 'OFFLINE' },
    });
    await h.page.getByRole('button', { name: 'Minecraft Server Hub', exact: true }).click();
    await h.page.getByRole('button', { name: 'Detectar archivos / actualizar accesos', exact: true }).click();
    await h.page.getByLabel('Archivo de inicio').selectOption('fail.cmd');
    await h.page.getByRole('button', { name: 'Guardar servidor', exact: true }).click();
    await h.page.getByRole('button', { name: 'Iniciar servidor', exact: true }).click();
    await expect(h.page.getByRole('status').filter({ hasText: /^ERROR$/ })).toBeVisible();
    await expect(h.page.getByRole('log')).toContainText('test startup');
    await h.page.getByPlaceholder('Selecciona la carpeta de tu servidor').fill(join(root, 'absent'));
    await h.page.getByRole('button', { name: 'Detectar archivos / actualizar accesos', exact: true }).click();
    await expect(h.page.getByRole('alert')).toContainText(/ENOENT|no such file/i);
    await h.page.screenshot({ path: 'work/hub-e2e/screenshots/hub-error.png' });
  } finally {
    if (h.app.process().exitCode === null) {
      await h.request({ op: 'serverStop' });
      await h.app.close();
    }
  }
});

test('closing with an unresponsive owned server keeps LiveForge open and permits safe retry', async () => {
  const data = await profile();
  const root = join(data, 'server');
  await mkdir(root);
  await scripts(root);
  const h = await launch(data);
  try {
    expect(
      await h.request({ op: 'serverSave', config: { root, entry: 'timeout.cmd', stopTimeout: 5 } }),
    ).toMatchObject({ ok: true });
    await h.request({ op: 'serverStart' });
    await expect
      .poll(async () => {
        const r = await h.request({ op: 'serverStatus' });
        return r.ok && r.server?.state;
      })
      .toBe('ONLINE');
    await h.app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      BrowserWindow.getAllWindows()[0]!.close();
    });
    await expect
      .poll(
        async () => {
          const r = await h.request({ op: 'serverStatus' });
          return r.ok && r.server?.state;
        },
        { timeout: 10000 },
      )
      .toBe('ERROR');
    expect(await h.request({ op: 'serverStatus' })).toMatchObject({ ok: true, server: { active: true } });
    await writeFile(join(root, 'stop.release'), 'release fixture normally');
    expect(await h.request({ op: 'serverStop' })).toMatchObject({ ok: true });
    expect(await h.request({ op: 'serverStatus' })).toMatchObject({
      ok: true,
      server: { state: 'OFFLINE', active: false },
    });
  } finally {
    await writeFile(join(root, 'stop.release'), 'release fixture normally');
    await h.request({ op: 'serverStop' });
    await h.app.close();
  }
});

for (const extension of ['bat', 'cmd']) {
  test(`Windows .${extension} with trailing pause stops once and clears PID and uptime`, async () => {
    const data = await profile();
    const root = join(data, 'server pause');
    const entry = `start server.${extension}`;
    await mkdir(root);
    await writeFile(
      join(root, entry),
      `@echo off\r\n"${process.execPath}" "${resolve('tests/fixtures/server.mjs')}"\r\npause\r\n`,
    );
    const h = await launch(data);
    try {
      await h.page.getByRole('button', { name: 'Minecraft Server Hub', exact: true }).click();
      await h.page.getByPlaceholder('Selecciona la carpeta de tu servidor').fill(root);
      await h.page.getByRole('button', { name: 'Detectar archivos / actualizar accesos', exact: true }).click();
      await h.page.getByLabel('Archivo de inicio').selectOption(entry);
      await h.page.getByRole('button', { name: 'Guardar servidor', exact: true }).click();
      await h.page.getByRole('button', { name: 'Iniciar servidor', exact: true }).click();
      await expect(h.page.getByRole('status').filter({ hasText: /^ONLINE$/ })).toBeVisible();
      await h.page.getByRole('button', { name: 'Detener servidor', exact: true }).click();
      await expect(h.page.getByRole('status').filter({ hasText: /^OFFLINE$/ })).toBeVisible();
      const stopped = await h.request({ op: 'serverStatus' });
      if (!stopped.ok || !stopped.server) throw new Error('Missing server snapshot');
      expect(stopped.server).toMatchObject({ active: false, busy: false, exitCode: 0 });
      expect(stopped.server.pid).toBeUndefined();
      expect(stopped.server.startedAt).toBeUndefined();
      expect(stopped.server.error).toBeUndefined();
      expect(stopped.server.logs.filter(l => l.text === '> stop')).toHaveLength(1);
      expect(stopped.server.logs.filter(l => l.level === 'ERROR')).toEqual([]);
      await expect(h.page.getByRole('log')).toContainText('Saving world');
    } finally {
      await h.request({ op: 'serverStop' });
      await h.app.close();
    }
  });
}
