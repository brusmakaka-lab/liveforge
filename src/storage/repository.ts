import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { migrations } from './migrations';
import {
  presetSchema,
  ruleSchema,
  savedCommandSchema,
  settingsSchema,
  type LogEntry,
  type Preset,
  type Rule,
  type SavedCommand,
  type Settings,
} from '../shared/model';

export class Repository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY)');
    for (const [index, sql] of migrations.entries()) {
      if (!this.db.prepare('SELECT version FROM migrations WHERE version=?').get(index + 1))
        this.transaction(() => {
          this.db.exec(sql);
          this.db.prepare('INSERT INTO migrations VALUES (?)').run(index + 1);
        });
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  settings(): Settings {
    const row = this.db.prepare('SELECT json FROM settings WHERE id=1').get();
    return settingsSchema.parse(row ? JSON.parse(String(row.json)) : {});
  }
  saveSettings(input: Settings): void {
    this.db
      .prepare('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json')
      .run(JSON.stringify(settingsSchema.parse(input)));
  }
  secret(name: string): string | undefined {
    const row = this.db.prepare('SELECT encrypted FROM secrets WHERE name=?').get(name);
    return row ? String(row.encrypted) : undefined;
  }
  saveSecret(name: string, encrypted: string): void {
    this.db
      .prepare('INSERT INTO secrets VALUES(?,?) ON CONFLICT(name) DO UPDATE SET encrypted=excluded.encrypted')
      .run(name, encrypted);
  }
  presets(): Preset[] {
    return this.db
      .prepare('SELECT id,name,created_at FROM presets ORDER BY created_at,id')
      .all()
      .map((row) => presetSchema.parse({ id: row.id, name: row.name, createdAt: row.created_at }));
  }
  savePreset(input: Preset): void {
    const p = presetSchema.parse(input);
    this.db
      .prepare('INSERT INTO presets VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name')
      .run(p.id, p.name, p.createdAt);
  }
  deletePreset(id: string): void {
    this.db.prepare('DELETE FROM presets WHERE id=?').run(id);
  }
  duplicatePreset(id: string): Preset {
    const source = this.presets().find((p) => p.id === id);
    if (!source) throw new Error('Preset inexistente');
    const copy = {
      ...source,
      id: randomUUID(),
      name: `${source.name.slice(0, 110)} · copia`,
      createdAt: Date.now(),
    };
    this.transaction(() => {
      this.savePreset(copy);
      for (const r of this.rules().filter((r) => r.presetId === id))
        this.saveRule({
          ...r,
          id: randomUUID(),
          presetId: copy.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
    });
    return copy;
  }
  rules(): Rule[] {
    return this.db
      .prepare('SELECT id,json FROM rules ORDER BY rowid')
      .all()
      .map((row) => {
        const actions = this.db
          .prepare('SELECT json FROM actions WHERE rule_id=? ORDER BY position')
          .all(String(row.id))
          .map((a) => JSON.parse(String(a.json)) as unknown);
        return ruleSchema.parse({ ...(JSON.parse(String(row.json)) as Record<string, unknown>), actions });
      });
  }
  saveRule(input: Rule): void {
    const rule = ruleSchema.parse(input);
    const { actions, ...rest } = rule;
    if (new Set(actions.map((a) => a.id)).size !== actions.length)
      throw new Error('IDs de acciones duplicados');
    // SAVEPOINT is valid both standalone and inside preset duplication transaction.
    this.db.exec('SAVEPOINT save_rule');
    try {
      this.db
        .prepare(
          'INSERT INTO rules VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET preset_id=excluded.preset_id,json=excluded.json',
        )
        .run(rule.id, rule.presetId, JSON.stringify(rest));
      this.db.prepare('DELETE FROM actions WHERE rule_id=?').run(rule.id);
      const insert = this.db.prepare('INSERT INTO actions VALUES(?,?,?,?)');
      actions.forEach((a, i) => insert.run(a.id, rule.id, i, JSON.stringify(a)));
      this.db.exec('RELEASE save_rule');
    } catch (error) {
      this.db.exec('ROLLBACK TO save_rule; RELEASE save_rule');
      throw error;
    }
  }
  deleteRule(id: string): void {
    this.db.prepare('DELETE FROM rules WHERE id=?').run(id);
  }
  commands(): SavedCommand[] {
    return this.db
      .prepare('SELECT json FROM saved_commands ORDER BY rowid')
      .all()
      .map((r) => savedCommandSchema.parse(JSON.parse(String(r.json))));
  }
  saveCommand(input: SavedCommand): void {
    const c = savedCommandSchema.parse(input);
    this.db
      .prepare('INSERT INTO saved_commands VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json')
      .run(c.id, JSON.stringify(c));
  }
  deleteCommand(id: string): void {
    this.db.prepare('DELETE FROM saved_commands WHERE id=?').run(id);
  }
  appendLog(entry: LogEntry): void {
    this.db.prepare('INSERT INTO logs VALUES(?,?,?)').run(entry.id, entry.timestamp, JSON.stringify(entry));
  }
  logs(): LogEntry[] {
    return this.db
      .prepare(
        'SELECT json FROM (SELECT json,timestamp FROM logs ORDER BY timestamp DESC LIMIT 500) ORDER BY timestamp',
      )
      .all()
      .map((r) => JSON.parse(String(r.json)) as LogEntry);
  }
  pruneLogs(days: number): void {
    this.db.prepare('DELETE FROM logs WHERE timestamp < ?').run(Date.now() - days * 86_400_000);
    this.db.exec(
      'DELETE FROM logs WHERE id IN (SELECT id FROM logs ORDER BY timestamp DESC LIMIT -1 OFFSET 10000)',
    );
  }
  close(): void {
    this.db.close();
  }
}
