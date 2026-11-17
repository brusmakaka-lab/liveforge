import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { newAction, newRule } from '../../src/shared/defaults';
import type { Rule, Snapshot } from '../../src/shared/model';

test('packaged Windows app boots with bundled SQLite, plays audio and runs multi-action workflows', async () => {
  const executablePath = resolve(
    process.env.LIVEFORGE_TEST_EXE ?? 'release/v0.2.0/win-unpacked/LiveForge.exe',
  );
  test.skip(!existsSync(executablePath), 'Generate the Windows package before this check');
  await mkdir('work', { recursive: true });
  const dataDir = await mkdtemp(resolve('work/packaged-profile-'));
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.LIVEFORGE_DATA_DIR = dataDir;
  const app = await electron.launch({ executablePath, args: [], env, timeout: 30_000 });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', { name: 'Tu LIVE, dentro del juego.' })).toBeVisible();
    expect(await app.evaluate(({ app: application }) => application.isPackaged)).toBe(true);
    const state = async (): Promise<Snapshot> =>
      page.evaluate(async () => {
        const response = await window.liveforge.request({ op: 'snapshot' });
        if (!response.ok || !response.snapshot) throw new Error('No state');
        return response.snapshot;
      });
    const initial = await state();
    expect(initial.dryRun).toBe(true);
    expect(initial.rules).toHaveLength(5);
    await page.getByRole('button', { name: 'START EVENTS', exact: true }).click();

    // Generate a short, quiet PCM WAV fixture, then use the production audio service.
    const samples = 1600;
    const sampleRate = 16000;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + samples * 2, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++)
      wav.writeInt16LE(Math.round(Math.sin((i * 440 * Math.PI * 2) / sampleRate) * 100), 44 + i * 2);
    const sound = join(dataDir, 'test.wav');
    await writeFile(sound, wav);
    const rule: Rule = {
      ...newRule(initial.settings.activePresetId),
      name: 'Packaged audio and alert',
      trigger: { type: 'FOLLOW' },
      actions: [
        { ...newAction('PlaySound'), type: 'PlaySound', file: sound, volume: 0.1 },
        { ...newAction('ShowAlert'), type: 'ShowAlert', text: 'Gracias {{username}}', duration: 6000 },
        { ...newAction('Wait'), type: 'Wait', duration: 40 },
        newAction('MinecraftCommand'),
      ],
    };
    const saved = await page.evaluate(
      async (input) => window.liveforge.request({ op: 'saveRule', rule: input }),
      rule,
    );
    expect(saved.ok).toBe(true);
    await page.getByRole('button', { name: 'Simulator', exact: true }).click();
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await page.getByRole('button', { name: 'Simular evento', exact: true }).click();
    await expect
      .poll(async () => (await state()).jobs.find((j) => j.ruleId === rule.id)?.status)
      .toBe('COMPLETED');
    await expect(page.getByRole('alert')).toContainText('Gracias testuser');
    const after = await state();
    expect(after.logs.some((l) => l.message.includes('[DRY RUN]') && l.message.includes('Ainztk58'))).toBe(
      true,
    );
    expect(
      after.logs.filter(
        (l) => l.level === 'ERROR' || (l.level === 'WARN' && /audio|reproductor|sonido/i.test(l.message)),
      ),
    ).toEqual([]);

    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'Pause queue', exact: true }).click();
    await page.getByRole('button', { name: 'Simulator', exact: true }).click();
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await page.getByRole('button', { name: 'Simular evento', exact: true }).click();
    await expect.poll(async () => (await state()).jobs.filter((j) => j.status === 'QUEUED').length).toBe(1);
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
    expect((await state()).jobs.filter((j) => j.status === 'QUEUED')).toHaveLength(0);
    await page.getByRole('button', { name: 'Resume queue', exact: true }).click();
    await page.getByRole('button', { name: 'STOP ALL EVENTS', exact: true }).first().click();
    expect((await state()).eventsEnabled).toBe(false);
    await mkdir('docs/screenshots', { recursive: true });
    await page.screenshot({ path: 'docs/screenshots/packaged-dashboard.png' });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
