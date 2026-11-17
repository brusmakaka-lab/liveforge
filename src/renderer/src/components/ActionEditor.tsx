import { ArrowDown, ArrowUp, FileAudio, Plus, Trash2 } from 'lucide-react';
import type { Action, LeafAction, SavedCommand } from '../../../shared/model';
import { newAction } from '../../../shared/defaults';
import type { Run } from '../desktop';
import { Field, NumberField } from './Common';

const actionNames: Record<Action['type'], string> = {
  MinecraftCommand: 'Minecraft command',
  Wait: 'Wait',
  PlaySound: 'Play sound',
  ShowAlert: 'Show alert',
  LogMessage: 'Log message',
  ActionPool: 'Weighted random pool',
};
export function ActionEditor({
  action,
  index,
  total,
  onChange,
  move,
  remove,
  commands,
  run,
  nested = false,
}: {
  action: Action;
  index: number;
  total: number;
  onChange: (a: Action) => void;
  move: (direction: number) => void;
  remove: () => void;
  commands: SavedCommand[];
  run: Run;
  nested?: boolean;
}) {
  return (
    <div className={`action-card ${nested ? 'nested' : ''}`}>
      <div className="action-heading">
        <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
        <select
          aria-label={`Tipo de acción ${index + 1}`}
          value={action.type}
          onChange={(e) => onChange({ ...newAction(e.target.value as Action['type']), id: action.id })}
        >
          {Object.entries(actionNames)
            .filter(([type]) => !nested || type !== 'ActionPool')
            .map(([type, label]) => (
              <option value={type} key={type}>
                {label}
              </option>
            ))}
        </select>
        <div className="action-tools">
          <button aria-label="Subir acción" disabled={index === 0} onClick={() => move(-1)}>
            <ArrowUp size={15} />
          </button>
          <button aria-label="Bajar acción" disabled={index === total - 1} onClick={() => move(1)}>
            <ArrowDown size={15} />
          </button>
          <button aria-label="Eliminar acción" onClick={remove}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {action.type === 'MinecraftCommand' && (
        <>
          <Field label="Comando Minecraft">
            <textarea
              className="code"
              rows={3}
              value={action.command}
              onChange={(e) => onChange({ ...action, command: e.target.value })}
              spellCheck={false}
            />
          </Field>
          <select
            aria-label="Insertar comando de biblioteca"
            value=""
            onChange={(e) => {
              const saved = commands.find((c) => c.id === e.target.value);
              if (saved) onChange({ ...action, command: saved.command });
            }}
          >
            <option value="">Insertar desde Command library…</option>
            {commands
              .filter((c) => c.command)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.category} / {c.name}
                </option>
              ))}
          </select>
          <p className="help-text">
            Variables:{' '}
            {
              '{{player}} · {{username}} · {{nickname}} · {{giftName}} · {{giftCount}} · {{likeCount}} · {{totalLikes}}'
            }
          </p>
        </>
      )}
      {action.type === 'Wait' && (
        <NumberField
          label="Espera (ms)"
          value={action.duration}
          onChange={(duration) => onChange({ ...action, duration })}
        />
      )}
      {action.type === 'PlaySound' && (
        <>
          <Field label="Archivo de audio">
            <div className="input-with-button">
              <input
                value={action.file}
                placeholder="MP3, WAV u OGG"
                onChange={(e) => onChange({ ...action, file: e.target.value })}
              />
              <button
                onClick={() => {
                  void run({ op: 'chooseSound' }).then((r) => {
                    if (r.ok && r.text) onChange({ ...action, file: r.text });
                  });
                }}
                aria-label="Elegir archivo de sonido"
              >
                <FileAudio size={16} />
              </button>
            </div>
          </Field>
          <div className="button-row">
            <button
              className="quiet"
              disabled={!action.file}
              onClick={() => void run({ op: 'previewSound', file: action.file, volume: action.volume })}
            >
              Probar sonido
            </button>
            <button className="quiet" onClick={() => void run({ op: 'stopSound' })}>
              Detener sonido
            </button>
          </div>
          <Field label={`Volumen del sonido · ${Math.round(action.volume * 100)}%`}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={action.volume}
              onChange={(e) => onChange({ ...action, volume: Number(e.target.value) })}
            />
          </Field>
        </>
      )}
      {action.type === 'ShowAlert' && (
        <>
          <Field label="Texto de la alerta">
            <input value={action.text} onChange={(e) => onChange({ ...action, text: e.target.value })} />
          </Field>
          <Field label="Icono alternativo (emoji)">
            <input
              value={action.icon ?? '🎁'}
              maxLength={16}
              onChange={(e) => onChange({ ...action, icon: e.target.value })}
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={action.showGiftImage !== false}
              onChange={(e) => onChange({ ...action, showGiftImage: e.target.checked })}
            />{' '}
            Usar imagen del regalo cuando exista
          </label>
          <div className="button-row">
            <button
              className="quiet"
              onClick={() => {
                void run({ op: 'chooseAlertImage' }).then((reply) => {
                  if (reply.ok && reply.image) onChange({ ...action, customImage: reply.image });
                });
              }}
            >
              {action.customImage ? 'Reemplazar imagen personalizada' : 'Elegir imagen personalizada'}
            </button>
            {action.customImage && (
              <button className="quiet" onClick={() => onChange({ ...action, customImage: undefined })}>
                Quitar imagen personalizada
              </button>
            )}
          </div>
          {action.customImage && (
            <img
              src={action.customImage}
              alt="Preview de imagen personalizada"
              width={64}
              height={64}
              style={{ objectFit: 'contain' }}
            />
          )}
          <p className="help-text">
            Imagen del regalo si está habilitada y disponible → imagen personalizada → emoji. La imagen
            personalizada se copia en la regla al guardar.
          </p>
          <p className="help-text">
            Variables: {'{{username}}'} · {'{{giftName}}'} · {'{{giftCount}}'}. Puedes escribir cualquier
            texto.
          </p>
          <button
            className="quiet"
            onClick={() =>
              void run({
                op: 'previewAlert',
                action,
                event: {
                  type: 'GIFT',
                  username: 'testuser',
                  giftName: 'Regalo de prueba',
                  giftId: 'preview',
                  quantity: 5,
                  streak: false,
                  repeatEnd: true,
                  diamondCount: 1,
                  likeCount: 0,
                  message: '',
                },
              })
            }
          >
            Previsualizar alerta
          </button>
          <NumberField
            label="Duración de alerta (ms)"
            value={action.duration}
            max={60_000}
            onChange={(duration) => onChange({ ...action, duration })}
          />
        </>
      )}
      {action.type === 'LogMessage' && (
        <Field label="Mensaje del log">
          <input value={action.message} onChange={(e) => onChange({ ...action, message: e.target.value })} />
        </Field>
      )}
      {action.type === 'ActionPool' && (
        <div className="pool-editor">
          <p className="help-text">
            Se elige una secuencia según su peso relativo. La seed de Settings permite repetir la selección.
          </p>
          {action.entries.map((entry, ei) => {
            const update = (next: typeof entry) =>
              onChange({ ...action, entries: action.entries.map((e, i) => (i === ei ? next : e)) });
            return (
              <div className="pool-entry" key={entry.id}>
                <div className="form-row">
                  <Field label="Nombre del evento">
                    <input value={entry.name} onChange={(e) => update({ ...entry, name: e.target.value })} />
                  </Field>
                  <NumberField
                    label="Peso"
                    value={entry.weight}
                    min={1}
                    max={1_000_000}
                    onChange={(weight) => update({ ...entry, weight })}
                  />
                  <button
                    className="icon-button"
                    aria-label="Eliminar opción del pool"
                    onClick={() =>
                      onChange({ ...action, entries: action.entries.filter((_, i) => i !== ei) })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {entry.actions.map((leaf, li) => (
                  <ActionEditor
                    key={leaf.id}
                    action={leaf}
                    index={li}
                    total={entry.actions.length}
                    nested
                    commands={commands}
                    run={run}
                    onChange={(next) =>
                      update({
                        ...entry,
                        actions: entry.actions.map((a, i) => (i === li ? (next as LeafAction) : a)),
                      })
                    }
                    move={(direction) => {
                      const actions = [...entry.actions];
                      [actions[li], actions[li + direction]] = [actions[li + direction]!, actions[li]!];
                      update({ ...entry, actions });
                    }}
                    remove={() => update({ ...entry, actions: entry.actions.filter((_, i) => i !== li) })}
                  />
                ))}
                <button
                  className="small"
                  onClick={() =>
                    update({
                      ...entry,
                      actions: [...entry.actions, newAction('MinecraftCommand') as LeafAction],
                    })
                  }
                >
                  <Plus size={14} /> Paso en esta opción
                </button>
              </div>
            );
          })}
          <button
            className="secondary"
            onClick={() =>
              onChange({
                ...action,
                entries: [
                  ...action.entries,
                  {
                    id: crypto.randomUUID(),
                    name: 'Nuevo evento',
                    weight: 1,
                    actions: [newAction('MinecraftCommand') as LeafAction],
                  },
                ],
              })
            }
          >
            <Plus size={15} /> Añadir opción
          </button>
        </div>
      )}
      <div className="quantity-options">
        <Field
          label="Respuesta a cantidad de regalos"
          hint="ONCE conserva las repeticiones manuales. PER_ITEM multiplica cantidad × repeticiones, limitada al máximo total; sólo afecta eventos Gift."
        >
          <select
            value={action.giftQuantity?.mode ?? 'ONCE'}
            onChange={(e) =>
              onChange({
                ...action,
                giftQuantity: {
                  mode: e.target.value as 'ONCE' | 'PER_ITEM',
                  interval: action.giftQuantity?.interval ?? 500,
                  maxExecutions: action.giftQuantity?.maxExecutions ?? 50,
                },
              })
            }
          >
            <option value="ONCE">Una vez · ONCE</option>
            <option value="PER_ITEM">Por cantidad · PER_ITEM</option>
          </select>
        </Field>
        {action.giftQuantity?.mode === 'PER_ITEM' && (
          <>
            <div className="form-row">
              <NumberField
                label="Intervalo por cantidad (ms)"
                value={action.giftQuantity.interval}
                max={60000}
                onChange={(interval) =>
                  onChange({ ...action, giftQuantity: { ...action.giftQuantity!, interval } })
                }
              />
              <NumberField
                label="Máximo de ejecuciones"
                value={action.giftQuantity.maxExecutions}
                min={1}
                max={1000}
                onChange={(maxExecutions) =>
                  onChange({ ...action, giftQuantity: { ...action.giftQuantity!, maxExecutions } })
                }
              />
            </div>
            <p className="help-text">
              Para cantidad final, elige «Al terminar la racha» en WHEN. «Cada regalo» ya divide en unidades.
              Cada actualización usa su cantidad acumulada. El máximo es por activación; presupuesto global de
              2.000 pasos por trabajo. En un pool por cantidad, las acciones internas reciben una unidad.
            </p>
          </>
        )}
      </div>
      <div className="timing-grid">
        <NumberField
          label="Delay antes (ms)"
          value={action.delayBefore}
          onChange={(delayBefore) => onChange({ ...action, delayBefore })}
        />
        <NumberField
          label="Repeticiones"
          value={action.repeatCount}
          min={1}
          max={1000}
          onChange={(repeatCount) => onChange({ ...action, repeatCount })}
        />
        <NumberField
          label="Intervalo (ms)"
          value={action.intervalBetweenRepeats}
          onChange={(intervalBetweenRepeats) => onChange({ ...action, intervalBetweenRepeats })}
        />
      </div>
    </div>
  );
}
