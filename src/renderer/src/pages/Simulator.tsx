import { OverlayControls } from '../components/OverlayControls';
import { useState } from 'react';
import {
  ArrowRight,
  FlaskConical,
  Gift,
  Heart,
  MessageSquare,
  Play,
  RotateCcw,
  Share2,
  Star,
  UserPlus,
} from 'lucide-react';
import type { EventType, Snapshot } from '../../../shared/model';
import type { Run } from '../desktop';
import { Feed, Field, NumberField } from '../components/Common';

const types = [
  { type: 'GIFT', label: 'Gift', icon: Gift },
  { type: 'LIKE', label: 'Likes', icon: Heart },
  { type: 'FOLLOW', label: 'Follow', icon: UserPlus },
  { type: 'SHARE', label: 'Share', icon: Share2 },
  { type: 'SUBSCRIBE', label: 'Subscribe', icon: Star },
  { type: 'CHAT', label: 'Chat', icon: MessageSquare },
] as const;
export function Simulator({ snapshot: s, run }: { snapshot: Snapshot; run: Run }) {
  const [type, setType] = useState<EventType>('GIFT');
  const [username, setUsername] = useState('testuser');
  const [giftName, setGiftName] = useState('Rose');
  const [giftId, setGiftId] = useState('5655');
  const [quantity, setQuantity] = useState(5);
  const [likeCount, setLikeCount] = useState(500);
  const [totalLikes, setTotalLikes] = useState(50_000);
  const [useTotal, setUseTotal] = useState(false);
  const [message, setMessage] = useState('!boss');
  const [streakMode, setStreakMode] = useState('final');
  const [streakId, setStreakId] = useState(crypto.randomUUID());
  const [coins, setCoins] = useState(1);
  const emit = async (nextQuantity = quantity, phase = streakMode): Promise<void> => {
    await run({
      op: 'simulate',
      event: {
        type,
        username,
        giftName,
        giftId,
        quantity: nextQuantity,
        likeCount: useTotal && type === 'LIKE' ? 0 : likeCount,
        totalLikes: useTotal && type === 'LIKE' ? totalLikes : undefined,
        message,
        streak: phase !== 'single',
        repeatEnd: phase !== 'progress',
        streakId,
        diamondCount: coins,
      },
    });
    if (phase !== 'progress') setStreakId(crypto.randomUUID());
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEVELOPER TOOLS</div>
          <h1>
            Ensaya tu próximo LIVE<span>.</span>
          </h1>
          <p>Los eventos simulados atraviesan el mismo motor que los eventos reales.</p>
        </div>
        <span className={`tag ${s.dryRun ? 'green' : 'warning'}`}>
          {s.dryRun ? 'DRY RUN ACTIVO' : 'COMANDOS REALES ACTIVOS'}
        </span>
      </div>
      <div className="sim-flow">
        <span>
          <FlaskConical size={16} /> Simulated event
        </span>
        <ArrowRight />
        <span>Normalizer / Bus</span>
        <ArrowRight />
        <span>Rules engine</span>
        <ArrowRight />
        <span>Queue</span>
        <ArrowRight />
        <span>Minecraft</span>
      </div>
      <div className="sim-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>Crear un evento</h2>
            <span className="tag">SIMULATOR</span>
          </div>
          <div className="editor-body">
            <div className="event-types">
              {types.map((t) => (
                <button
                  key={t.type}
                  className={t.type === type ? 'selected' : ''}
                  onClick={() => setType(t.type)}
                >
                  <t.icon size={20} />
                  {t.label}
                </button>
              ))}
            </div>
            <Field label="Username del espectador">
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            {type === 'GIFT' && (
              <>
                <div className="form-row">
                  <Field label="Gift name">
                    <input value={giftName} onChange={(e) => setGiftName(e.target.value)} />
                  </Field>
                  <Field label="Gift ID">
                    <input value={giftId} onChange={(e) => setGiftId(e.target.value)} />
                  </Field>
                </div>
                <div className="form-row">
                  <NumberField
                    label="Cantidad (acumulada en la racha)"
                    value={quantity}
                    min={1}
                    max={100_000}
                    onChange={setQuantity}
                  />
                  <NumberField label="Coins por regalo" value={coins} max={1_000_000} onChange={setCoins} />
                </div>
                <Field label="Fase del regalo">
                  <select value={streakMode} onChange={(e) => setStreakMode(e.target.value)}>
                    <option value="final">Final de racha</option>
                    <option value="progress">Racha en progreso</option>
                    <option value="single">Regalo sin racha</option>
                  </select>
                </Field>
                <div className="button-row">
                  {[1, 2, 5].map((count) => (
                    <button
                      key={count}
                      className="quiet"
                      onClick={() => {
                        setQuantity(count);
                        setStreakMode('progress');
                        void emit(count, 'progress');
                      }}
                    >
                      Racha x{count}
                    </button>
                  ))}
                  <button
                    className="secondary"
                    onClick={() => {
                      setStreakMode('final');
                      void emit(quantity, 'final');
                    }}
                  >
                    Finalizar racha
                  </button>
                </div>
                <p className="help-text">
                  Usa x1 → x2 → x5 → Finalizar para ver el progreso y las acciones. «Nueva racha» reinicia la
                  identidad.
                </p>
                <div className="help-text">
                  Racha: {streakId.slice(0, 8)}{' '}
                  <button className="text-button" onClick={() => setStreakId(crypto.randomUUID())}>
                    Nueva racha
                  </button>
                </div>
              </>
            )}
            {type === 'LIKE' && (
              <>
                <Field label="Modo de likes">
                  <select
                    value={useTotal ? 'total' : 'batch'}
                    onChange={(e) => setUseTotal(e.target.value === 'total')}
                  >
                    <option value="batch">Likes recibidos · incremento</option>
                    <option value="total">Total likes · actualización absoluta</option>
                  </select>
                </Field>
                {useTotal ? (
                  <NumberField
                    label="Total likes del LIVE"
                    value={totalLikes}
                    max={1_000_000_000}
                    onChange={setTotalLikes}
                  />
                ) : (
                  <NumberField
                    label="Likes recibidos en este evento"
                    value={likeCount}
                    max={10_000_000}
                    onChange={setLikeCount}
                  />
                )}
              </>
            )}
            {type === 'CHAT' && (
              <Field label="Mensaje del chat">
                <input value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
            )}
            {!s.eventsEnabled && (
              <div className="inline-notice">
                Los triggers están detenidos. Pulsa START EVENTS para ejecutar reglas.
              </div>
            )}
            <div className="button-row">
              {!s.eventsEnabled && (
                <button className="secondary" onClick={() => void run({ op: 'startEvents' })}>
                  <Play size={15} /> START EVENTS
                </button>
              )}
              <button className="primary" onClick={() => void emit()}>
                <FlaskConical size={16} /> Simular evento <ArrowRight size={15} />
              </button>
            </div>
            <p className="help-text">
              El simulador sí actualiza los contadores de la sesión. El TEST individual de una regla los
              conserva.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Resultado en tiempo real</h2>
            <span className="live-dot" />
          </div>
          <Feed logs={s.logs} limit={30} />
        </section>
      </div>
      <OverlayControls snapshot={s} run={run} />
      <section className="panel session-panel">
        <div>
          <h2>Contadores de sesión</h2>
          <p>
            {s.session.totalLikes.toLocaleString()} likes · {s.session.eventsReceived} eventos ·{' '}
            {s.session.triggeredThresholds.length} thresholds disparados
          </p>
          <small>{s.session.id}</small>
        </div>
        <button className="secondary" onClick={() => void run({ op: 'resetSession' })}>
          <RotateCcw size={15} /> Reset session counters
        </button>
      </section>
    </>
  );
}
