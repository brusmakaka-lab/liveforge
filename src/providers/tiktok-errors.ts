// Connector errors include { info, exception } and config.requestErrs. Error's
// message/stack are not enumerable, so JSON.stringify alone loses the diagnosis.
const fields = [
  'name',
  'message',
  'stack',
  'info',
  'exception',
  'cause',
  'errors',
  'config',
  'routeId',
  'requestErrs',
  'code',
  'status',
  'statusCode',
  'reason',
  'requestId',
  'retryAfter',
  'response',
  'data',
] as const;

function safeText(value: string): string {
  // Never retain request headers, cookies, full request configs or signed URLs.
  return value
    .replace(/https?:\/\/[^\s<>"']+/g, (text) => {
      try {
        const url = new URL(text);
        return `${url.origin}${url.pathname}${url.search ? '?[REDACTED]' : ''}`;
      } catch {
        return '[URL]';
      }
    })
    .slice(0, 8000);
}

export function tiktokErrorDetails(error: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>();
  let nodes = 0;
  function visit(value: unknown, depth: number): unknown {
    if (++nodes > 100 || depth > 8) return '[truncated]';
    if (typeof value === 'string') return safeText(value);
    if (typeof value === 'bigint') return value.toString();
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 10).map((item) => visit(item, depth + 1));
    const result: Record<string, unknown> = {};
    for (const key of fields) {
      try {
        const field = (value as Record<string, unknown>)[key];
        if (field !== undefined) result[key] = visit(field, depth + 1);
      } catch {
        result[key] = '[unreadable field]';
      }
    }
    return result;
  }
  const result = visit(error, 0);
  return result !== null && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : { message: String(result) };
}

export function tiktokErrorMessage(error: unknown): string {
  const messages: string[] = [];
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    const record = value as Record<string, unknown>;
    const message = record.message ?? record.info;
    if (typeof message === 'string' && !messages.includes(message)) messages.push(message);
    for (const key of ['exception', 'cause', 'errors', 'config', 'requestErrs']) collect(record[key]);
  }
  collect(tiktokErrorDetails(error));
  return (messages.join(' · ') || 'Error TikTok sin mensaje; consultar Diagnostics').slice(0, 3000);
}
