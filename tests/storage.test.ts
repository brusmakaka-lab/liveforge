import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from '../src/storage/repository';
import { starterData } from '../src/shared/defaults';
import { settingsSchema } from '../src/shared/model';

it('migrates, persists settings/rules/actions, duplicates atomically and cascades deletes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liveforge-test-'));
  const path = join(dir, 'test.sqlite');
  try {
    let repo = new Repository(path);
    const data = starterData();
    repo.savePreset(data.preset);
    data.rules.forEach((r) => repo.saveRule(r));
    repo.saveSettings({ ...settingsSchema.parse({}), tiktokUsername: 'myuser' });
    repo.saveCommand(data.commands[0]!);
    repo.saveSecret('test', 'encrypted');
    repo.close();
    repo = new Repository(path);
    expect(repo.settings().tiktokUsername).toBe('myuser');
    expect(repo.rules()).toEqual(data.rules);
    expect(repo.commands()).toHaveLength(1);
    expect(repo.secret('test')).toBe('encrypted');
    const clone = repo.duplicatePreset(data.preset.id);
    expect(repo.rules().filter((r) => r.presetId === clone.id)).toHaveLength(5);
    repo.deletePreset(data.preset.id);
    expect(repo.rules()).toHaveLength(5);
    const invalid = { ...data.rules[0]!, presetId: 'missing' };
    expect(() => repo.saveRule(invalid)).toThrow();
    expect(repo.rules()).toHaveLength(5);
    repo.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 15_000);
