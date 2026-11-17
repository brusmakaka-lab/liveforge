import { randomUUID } from 'node:crypto';
import type { LogEntry } from '../shared/model';

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
export class Logger {
  readonly entries: LogEntry[] = [];
  errors = 0;
  private secrets = new Set<string>();
  constructor(private readonly persist?: (entry: LogEntry) => void) {}
  protect(value: string): void {
    if (value) this.secrets.add(value);
  }
  write(
    level: LogEntry['level'],
    category: LogEntry['category'],
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const redact = (v: string): string => {
      for (const secret of this.secrets) v = v.split(secret).join('[REDACTED]');
      return v;
    };
    const serialized = data
      ? redact(
          JSON.stringify(data, (key, value: unknown) =>
            /password|cookie|token|secret|signApiKey/i.test(key)
              ? '[REDACTED]'
              : typeof value === 'bigint'
                ? value.toString()
                : value,
          ),
        )
      : undefined;
    const safeData = serialized
      ? serialized.length > 100_000
        ? { truncated: true, preview: serialized.slice(0, 4000) }
        : (JSON.parse(serialized) as Record<string, unknown>)
      : undefined;
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      level,
      category,
      message: redact(message).slice(0, 5000),
      data: safeData,
    };
    this.entries.push(entry);
    if (this.entries.length > 500) this.entries.splice(0, this.entries.length - 500);
    if (level === 'ERROR') this.errors++;
    try {
      this.persist?.(entry);
    } catch (error) {
      process.stderr.write(`Log persistence: ${errorMessage(error)}\n`);
    }
  }
}
