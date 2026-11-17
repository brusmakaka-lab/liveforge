import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CircleAlert,
  FlaskConical,
  Heart,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Square,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import type { Snapshot } from '../../../shared/model';
import type { Run } from '../desktop';
import { Feed, Status, Toggle, triggerLabel } from '../components/Common';

export function Dashboard({
  snapshot: s,
  run,
  navigate,
}: {
  snapshot: Snapshot;
  run: Run;
  navigate: (page: 'settings' | 'presets' | 'simulator') => void;
}) {
  const active = s.presets.find((p) => p.id === s.settings.activePresetId);
  const rules = s.rules.filter((r) => r.presetId === active?.id);
  const pending = s.jobs.filter((j) => j.status === 'QUEUED');
  const running = s.jobs.find((j) => j.status === 'RUNNING');
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <i /> YOUR LIVE. YOUR RULES.
          </div>
          <h1>
            Tu LIVE, dentro del juego<span>.</span>
          </h1>
          <p>Convierte la interacción de tu comunidad en el próximo evento.</p>
        </div>
        <button className="secondary" onClick={() => navigate('simulator')}>
          <FlaskConical size={16} /> Abrir simulador <ArrowUpRight size={15} />
        </button>
      </div>
      <section className="connection-strip">
        <div className="connection-block">
          <span className="connection-icon tiktok">
            <Radio />
          </span>
          <div>
            <div className="connection-title">
              TikTok LIVE <Status value={s.live} />
            </div>
            <p>
              {s.settings.tiktokUsername
                ? `@${s.settings.tiktokUsername.replace(/^@/, '')}`
                : 'Configura tu @username'}
            </p>
          </div>
          <button
            className="small"
            disabled={s.live.state === 'CONNECTING'}
            onClick={() =>
              void run({
                op:
                  s.live.state === 'DISCONNECTED' || s.live.state === 'ERROR'
                    ? 'connectLive'
                    : 'disconnectLive',
              })
            }
          >
            {s.live.state === 'DISCONNECTED' || s.live.state === 'ERROR' ? 'CONNECT LIVE' : 'DISCONNECT'}
          </button>
        </div>
        <span className="bridge-arrow">
          <ArrowRight size={20} />
        </span>
        <div className="connection-block">
          <span className="connection-icon minecraft">
            <Box />
          </span>
          <div>
            <div className="connection-title">
              Minecraft <Status value={s.game} />
            </div>
            <p>
              {s.settings.player}{' '}
              <span>· {s.game.latency !== undefined ? `${s.game.latency} ms` : 'Mohist 1.20.1'}</span>
            </p>
          </div>
          <button
            className="small"
            disabled={s.game.state === 'CONNECTING'}
            onClick={() => void run({ op: s.game.state === 'CONNECTED' ? 'testGame' : 'connectGame' })}
          >
            {s.game.state === 'CONNECTED' ? 'TEST' : 'CONNECT'}
          </button>
        </div>
      </section>
      {((s.live.detail && ['ERROR', 'RECONNECTING'].includes(s.live.state)) || s.game.state === 'ERROR') && (
        <p className="inline-error">
          {s.live.state === 'RECONNECTING' ? s.live.detail : s.game.detail || s.live.detail}
        </p>
      )}
      <section className="controls">
        <div>
          <button
            className="primary"
            disabled={s.eventsEnabled}
            onClick={() => void run({ op: 'startEvents' })}
          >
            <Play size={16} fill="currentColor" />
            {s.eventsEnabled ? 'EVENTS ACTIVOS' : 'START EVENTS'}
          </button>
          <button className="danger" onClick={() => void run({ op: 'stopEvents' })}>
            <Square size={16} fill="currentColor" /> STOP ALL EVENTS
          </button>
          <span className="divider" />
          <button
            className="quiet"
            onClick={() => void run({ op: s.queuePaused ? 'resumeQueue' : 'pauseQueue' })}
          >
            {s.queuePaused ? <Play size={15} /> : <Pause size={15} />}{' '}
            {s.queuePaused ? 'Resume queue' : 'Pause queue'}
          </button>
          <button className="quiet" onClick={() => void run({ op: 'clearQueue' })}>
            <Trash2 size={15} /> Clear queue
          </button>
        </div>
        <div className={`dry-control ${s.dryRun ? 'enabled' : ''}`}>
          <ShieldCheck size={17} />
          <span>DRY RUN</span>
          <Toggle
            checked={s.dryRun}
            label="DRY RUN"
            onChange={() => void run({ op: 'dryRun', value: !s.dryRun })}
          />
        </div>
      </section>
      <section className="stats-grid">
        {[
          {
            label: 'Eventos recibidos',
            value: s.session.eventsReceived,
            icon: Users,
            note: s.session.source === 'tiktok' ? 'Sesión de TikTok LIVE' : 'Sesión de simulación',
            color: 'teal',
          },
          {
            label: 'Total likes',
            value: s.session.totalLikes,
            icon: Heart,
            note: `${s.session.triggeredThresholds.length} thresholds activados`,
            color: 'pink',
          },
          {
            label: 'Acciones en cola',
            value: pending.length,
            icon: ArrowDownToLine,
            note: running ? `Ejecutando: ${running.ruleName}` : 'Lista para el próximo evento',
            color: 'blue',
          },
          {
            label: 'Trabajos completados',
            value: s.executed,
            icon: Check,
            note: `${s.errors} errores registrados`,
            color: 'amber',
          },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div>
              <span>{stat.label}</span>
              <stat.icon className={stat.color} size={18} />
            </div>
            <strong>{stat.value.toLocaleString('es-AR')}</strong>
            <small>{stat.note}</small>
          </div>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel event-panel">
          <div className="panel-heading">
            <h2>
              <span className="live-dot" /> Live event feed
            </h2>
            <span className="tag">TIEMPO REAL</span>
          </div>
          <div className="feed-caption">
            <span>Actividad del LIVE, reglas y ejecución</span>
            <small>Últimos 70 registros</small>
          </div>
          <Feed logs={s.logs} />
        </section>
        <div className="right-stack">
          <section className="panel preset-panel">
            <div className="panel-heading">
              <h2>Preset activo</h2>
              <span className="tag green">GAMEPLAY</span>
            </div>
            <div className="preset-art">
              <div className="orbit o1" />
              <div className="orbit o2" />
              <Box size={48} strokeWidth={1.2} />
              <span className="art-dot one" />
              <span className="art-dot two" />
            </div>
            <div className="preset-body">
              <span className="eyebrow">MINECRAFT / LOCAL SERVER</span>
              <h3>{active?.name}</h3>
              <p>
                {rules.filter((r) => r.enabled).length} reglas activas <span>·</span> {rules.length} reglas en
                total
              </p>
              <div className="rule-preview">
                {rules.slice(0, 3).map((r) => (
                  <div key={r.id}>
                    <i className={r.enabled ? 'green-dot' : ''} />
                    <span>{triggerLabel(r.trigger)}</span>
                    <span>
                      {s.cooldowns[r.id] ? (
                        `${Math.ceil((s.cooldowns[r.id]! - Date.now()) / 1000)}s`
                      ) : (
                        <Zap size={12} />
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <button className="wide secondary" onClick={() => navigate('presets')}>
                Editar preset <ArrowRight size={15} />
              </button>
            </div>
          </section>
          <section className={`safe-note ${s.dryRun ? '' : 'real'}`}>
            <ShieldCheck size={24} />
            <div>
              <h3>{s.dryRun ? 'Ensaya antes del caos' : 'Minecraft recibe comandos reales'}</h3>
              <p>
                {s.dryRun
                  ? 'DRY RUN mantiene el motor activo y registra los comandos sin enviarlos al juego.'
                  : 'STOP ALL EVENTS está siempre disponible en la barra inferior.'}
              </p>
            </div>
          </section>
        </div>
      </div>
      {pending.length > 0 && (
        <section className="panel queue-panel">
          <div className="panel-heading">
            <h2>Action queue</h2>
            <span>{pending.length} / 500 pendientes</span>
          </div>
          {pending.slice(0, 20).map((j) => (
            <div className="queue-row" key={j.id}>
              <span>{j.ruleName}</span>
              <span className="tag">{j.priority}</span>
              <small>
                {j.waitReason ||
                  (j.notBefore > Date.now()
                    ? `Disponible ${new Date(j.notBefore).toLocaleTimeString()}`
                    : 'En espera')}
              </small>
            </div>
          ))}
        </section>
      )}
      {!s.settings.tiktokUsername && (
        <div className="setup-note">
          <CircleAlert size={16} /> Tu espacio está listo. Completa TikTok y RCON en Settings.
          <button onClick={() => navigate('settings')}>
            Configurar <ArrowRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
