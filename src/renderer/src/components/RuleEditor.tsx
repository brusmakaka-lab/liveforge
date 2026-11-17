import { useState } from 'react';
import { Check, FlaskConical, Plus, Save, Trash2 } from 'lucide-react';
import { newAction, newTrigger } from '../../../shared/defaults';
import { ruleSchema, type Rule, type SavedCommand, type Trigger } from '../../../shared/model';
import type { Run } from '../desktop';
import { Field, NumberField, Toggle } from './Common';
import { ActionEditor } from './ActionEditor';
import { useEditorScroll } from './useEditorScroll';
import { RulePublicSettings } from './RulePublicSettings';

const triggerNames: Record<Trigger['type'], string> = {
  GIFT: 'Gift',
  FOLLOW: 'Follow',
  SHARE: 'Share',
  LIKE_BATCH: 'Likes · cada lote',
  TOTAL_LIKES_THRESHOLD: 'Likes · umbral total',
  SUBSCRIBE: 'Subscribe',
  CHAT_COMMAND: 'Chat command',
};
export function RuleEditor({
  initial,
  commands,
  run,
  onSaved,
  onDeleted,
}: {
  initial: Rule;
  commands: SavedCommand[];
  run: Run;
  onSaved: (r: Rule) => void;
  onDeleted: () => void;
}) {
  const [rule, setRule] = useState(initial);
  const editorRef = useEditorScroll(initial.id);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = (next: Rule): void => {
    setRule(next);
    setSaved(false);
  };
  const save = async (test = false): Promise<void> => {
    const result = ruleSchema.safeParse(rule);
    if (!result.success) {
      setError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
      return;
    }
    setBusy(true);
    setError('');
    const response = await run({ op: 'saveRule', rule: result.data });
    if (response.ok) {
      onSaved(result.data);
      setSaved(true);
      if (test) await run({ op: 'testRule', id: rule.id });
    }
    setBusy(false);
  };
  const t = rule.trigger;
  return (
    <section className="panel rule-editor" ref={editorRef}>
      <div className="panel-heading">
        <h2>Rule editor</h2>
        <div className="switch-label">
          <span>{rule.enabled ? 'ON' : 'OFF'}</span>
          <Toggle
            checked={rule.enabled}
            label="Regla habilitada"
            onChange={() => change({ ...rule, enabled: !rule.enabled })}
          />
        </div>
      </div>
      <div className="editor-body">
        <Field label="Nombre de la regla">
          <input value={rule.name} onChange={(e) => change({ ...rule, name: e.target.value })} />
        </Field>
        <div className="section-label">
          <span>01</span> WHEN <small>Qué activa esta regla</small>
        </div>
        <Field label="Trigger">
          <select
            value={t.type}
            onChange={(e) => change({ ...rule, trigger: newTrigger(e.target.value as Trigger['type']) })}
          >
            {Object.entries(triggerNames).map(([type, name]) => (
              <option key={type} value={type}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        {t.type === 'GIFT' && (
          <>
            <div className="form-row">
              <Field
                label="Gift name"
                hint="Sin ID se compara este nombre (ignora espacios de borde y mayúsculas). Usa el nombre recibido en el feed; no se traducen nombres."
              >
                <input
                  value={t.giftName}
                  onChange={(e) => change({ ...rule, trigger: { ...t, giftName: e.target.value } })}
                />
              </Field>
              <Field label="Gift ID (opcional)" hint="Si está definido, tiene prioridad sobre el nombre.">
                <input
                  value={t.giftId}
                  onChange={(e) => change({ ...rule, trigger: { ...t, giftId: e.target.value } })}
                />
              </Field>
            </div>
            <Field label="Tratamiento de rachas">
              <select
                value={t.mode}
                onChange={(e) =>
                  change({
                    ...rule,
                    trigger: { ...t, mode: e.target.value as Extract<Trigger, { type: 'GIFT' }>['mode'] },
                  })
                }
              >
                <option value="STREAK_END">Al terminar la racha · cantidad final</option>
                <option value="STREAK_UPDATE">Una vez por actualización · cantidad acumulada</option>
                <option value="EACH_GIFT">Una vez por cada regalo · incremento</option>
              </select>
            </Field>
          </>
        )}
        {(t.type === 'LIKE_BATCH' || t.type === 'TOTAL_LIKES_THRESHOLD') && (
          <NumberField
            label={t.type === 'LIKE_BATCH' ? 'Cada cuántos likes' : 'Threshold de likes totales'}
            value={t.amount}
            min={1}
            max={1_000_000_000}
            onChange={(amount) => change({ ...rule, trigger: { ...t, amount } })}
          />
        )}
        {t.type === 'CHAT_COMMAND' && (
          <div className="form-row">
            <Field label="Texto del chat">
              <input
                value={t.text}
                onChange={(e) => change({ ...rule, trigger: { ...t, text: e.target.value } })}
              />
            </Field>
            <Field label="Coincidencia">
              <select
                value={t.match}
                onChange={(e) =>
                  change({ ...rule, trigger: { ...t, match: e.target.value as 'EXACT' | 'CONTAINS' } })
                }
              >
                <option value="EXACT">Exacta</option>
                <option value="CONTAINS">Contiene</option>
              </select>
            </Field>
          </div>
        )}
        <details className="conditions">
          <summary>Condiciones opcionales</summary>
          <div className="form-row">
            <NumberField
              label="Cantidad mínima de regalos"
              value={rule.conditions.minQuantity}
              max={100_000}
              onChange={(minQuantity) => change({ ...rule, conditions: { ...rule.conditions, minQuantity } })}
            />
            <NumberField
              label="Coins mínimos de la racha"
              value={rule.conditions.minCoins}
              max={1_000_000_000}
              onChange={(minCoins) => change({ ...rule, conditions: { ...rule.conditions, minCoins } })}
            />
          </div>
          <Field label="Sólo este username (vacío = todos)">
            <input
              value={rule.conditions.username}
              onChange={(e) =>
                change({ ...rule, conditions: { ...rule.conditions, username: e.target.value } })
              }
            />
          </Field>
        </details>
        <Field
          label="Nivel de impacto"
          hint="Define el estilo de la alerta y la prioridad del audio. No modifica la prioridad de Minecraft."
        >
          <select
            value={rule.impact ?? 'NORMAL'}
            onChange={(e) => change({ ...rule, impact: e.target.value as NonNullable<Rule['impact']> })}
          >
            {['LOW', 'NORMAL', 'HIGH', 'EPIC'].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </Field>
        {t.type === 'GIFT' && (
          <div className="conditions">
            <div className="switch-label">
              Mostrar progreso desde el primer regalo
              <Toggle
                label="Mostrar progreso desde el primer regalo"
                checked={rule.showStreakProgress ?? false}
                onChange={() => change({ ...rule, showStreakProgress: !rule.showStreakProgress })}
              />
            </div>
            <p className="help-text">
              Actualiza las acciones ShowAlert de esta regla durante la racha. Audio y Minecraft conservan el
              modo elegido. Respeta las condiciones; el progreso visual no consume cooldown. No se anticipan
              alertas dentro de pools.
            </p>
          </div>
        )}
        <RulePublicSettings rule={rule} change={change} />
        <div className="section-label">
          <span>02</span> DO <small>Acciones en orden</small>
        </div>
        {rule.actions.map((action, index) => (
          <ActionEditor
            key={action.id}
            action={action}
            index={index}
            total={rule.actions.length}
            commands={commands}
            run={run}
            onChange={(next) =>
              change({ ...rule, actions: rule.actions.map((a, i) => (i === index ? next : a)) })
            }
            move={(direction) => {
              const actions = [...rule.actions];
              [actions[index], actions[index + direction]] = [actions[index + direction]!, actions[index]!];
              change({ ...rule, actions });
            }}
            remove={() => change({ ...rule, actions: rule.actions.filter((_, i) => i !== index) })}
          />
        ))}
        <button
          className="add-action"
          onClick={() => change({ ...rule, actions: [...rule.actions, newAction()] })}
        >
          <Plus size={16} /> Añadir acción
        </button>
        <div className="section-label">
          <span>03</span> CONTROL <small>Ritmo y prioridad</small>
        </div>
        <div className="form-row">
          <NumberField
            label="Cooldown (segundos)"
            value={rule.cooldown.duration / 1000}
            max={86400}
            onChange={(seconds) =>
              change({ ...rule, cooldown: { ...rule.cooldown, duration: Math.round(seconds * 1000) } })
            }
          />
          <Field label="Durante el cooldown">
            <select
              value={rule.cooldown.policy}
              onChange={(e) =>
                change({
                  ...rule,
                  cooldown: { ...rule.cooldown, policy: e.target.value as Rule['cooldown']['policy'] },
                })
              }
            >
              <option>IGNORE</option>
              <option>QUEUE</option>
              <option>REPLACE</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Prioridad">
            <select
              value={rule.priority}
              onChange={(e) => change({ ...rule, priority: e.target.value as Rule['priority'] })}
            >
              {['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Si falla una acción">
            <select
              value={rule.errorPolicy}
              onChange={(e) => change({ ...rule, errorPolicy: e.target.value as Rule['errorPolicy'] })}
            >
              <option value="STOP_JOB">Detener este trabajo</option>
              <option value="CONTINUE">Continuar la secuencia</option>
            </select>
          </Field>
        </div>
        <p className="help-text">
          TEST guarda y ejecuta esta secuencia con un evento simulado, sin alterar los thresholds de sesión.
          Omite elegibilidad, condiciones y cooldown; respeta STOP y DRY RUN. Usa Simulator para comprobar si
          un evento coincide con la regla.
        </p>
        {error && <pre className="inline-error">{error}</pre>}
      </div>
      <div className="editor-footer">
        <button
          className="quiet delete-rule"
          onClick={() => {
            if (confirmDelete)
              void run({ op: 'deleteRule', id: rule.id }).then((r) => {
                if (r.ok) onDeleted();
              });
            else setConfirmDelete(true);
          }}
        >
          <Trash2 size={15} />
          {confirmDelete ? 'Confirmar eliminación' : 'Eliminar'}
        </button>
        <button className="secondary" disabled={busy} onClick={() => void save(true)}>
          <FlaskConical size={16} /> TEST
        </button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {saved ? <Check size={16} /> : <Save size={16} />} {saved ? 'Guardado' : 'SAVE RULE'}
        </button>
      </div>
    </section>
  );
}
