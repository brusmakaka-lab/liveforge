export const migrations = [
  `CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), json TEXT NOT NULL);
   CREATE TABLE secrets (name TEXT PRIMARY KEY, encrypted TEXT NOT NULL);
   CREATE TABLE presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
   CREATE TABLE rules (id TEXT PRIMARY KEY, preset_id TEXT NOT NULL REFERENCES presets(id) ON DELETE CASCADE, json TEXT NOT NULL);
   CREATE INDEX rules_preset ON rules(preset_id);
   CREATE TABLE actions (id TEXT NOT NULL, rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE, position INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY(rule_id, id));
   CREATE TABLE saved_commands (id TEXT PRIMARY KEY, json TEXT NOT NULL);
   CREATE TABLE logs (id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, json TEXT NOT NULL);
   CREATE INDEX logs_timestamp ON logs(timestamp);`,
];
