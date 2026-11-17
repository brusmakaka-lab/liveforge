import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import type { ConnectionStatus, LogEntry, Trigger } from '../../../shared/model';
import { Activity, Check, CircleAlert, Command, Radio, Sparkles } from 'lucide-react';

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): ReactNode {
  const id = useId();
  const associate = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<{
        id?: string;
        children?: ReactNode;
        'aria-describedby'?: string;
      }>;
      if (typeof node.type === 'string' && ['input', 'textarea', 'select'].includes(node.type))
        return cloneElement(element, { id, 'aria-describedby': hint ? `${id}-hint` : undefined });
      return element.props.children ? cloneElement(element, {}, associate(element.props.children)) : node;
    });
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {associate(children)}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  max = 3_600_000,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
  min?: number;
}): ReactNode {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}): ReactNode {
  return (
    <button
      className={`toggle ${checked ? 'on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
export function Status({ value }: { value: ConnectionStatus }): ReactNode {
  return (
    <span className={`status ${value.state.toLowerCase()}`} title={value.detail}>
      <i />
      {
        {
          CONNECTED: 'Conectado',
          CONNECTING: 'Conectando',
          RECONNECTING: 'Reconectando',
          DISCONNECTED: 'Desconectado',
          ERROR: 'Error',
        }[value.state]
      }
    </span>
  );
}
export function triggerLabel(t: Trigger): string {
  switch (t.type) {
    case 'GIFT':
      return `${t.giftName || `Gift #${t.giftId}`} · ${t.mode === 'STREAK_END' ? 'fin de racha' : t.mode === 'STREAK_UPDATE' ? 'actualización de racha' : 'cada regalo'}`;
    case 'FOLLOW':
      return 'Nuevo follow';
    case 'SHARE':
      return 'Share del LIVE';
    case 'SUBSCRIBE':
      return 'Nueva suscripción';
    case 'LIKE_BATCH':
      return `Cada ${t.amount.toLocaleString()} likes`;
    case 'TOTAL_LIKES_THRESHOLD':
      return `${t.amount.toLocaleString()} likes totales`;
    case 'CHAT_COMMAND':
      return `Chat ${t.text}`;
  }
}
export function Feed({ logs, limit = 70 }: { logs: LogEntry[]; limit?: number }): ReactNode {
  return (
    <div className="feed">
      {logs
        .slice(-limit)
        .reverse()
        .map((log) => {
          const Icon =
            log.level === 'ERROR' || log.level === 'WARN'
              ? CircleAlert
              : log.category === 'LIVE'
                ? Radio
                : log.category === 'RULE'
                  ? Sparkles
                  : log.category === 'MINECRAFT'
                    ? Command
                    : log.message.includes('COMPLETED')
                      ? Check
                      : Activity;
          return (
            <div className={`feed-row ${log.level.toLowerCase()}`} key={log.id}>
              <span className={`feed-icon cat-${log.category.toLowerCase()}`}>
                <Icon size={15} />
              </span>
              <time>{new Date(log.timestamp).toLocaleTimeString('es-AR', { hour12: false })}</time>
              <div>
                <span>{log.message}</span>
                {log.level === 'ERROR' && log.data?.error ? <small>{String(log.data.error)}</small> : null}
              </div>
              <b>{log.category}</b>
            </div>
          );
        })}
      {!logs.length && <p className="empty">Los eventos de tu LIVE aparecerán aquí.</p>}
    </div>
  );
}
