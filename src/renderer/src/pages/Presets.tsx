import { useState } from 'react';
import { Copy, Layers, Plus, Trash2, Zap } from 'lucide-react';
import { newRule } from '../../../shared/defaults';
import type { Rule, Snapshot } from '../../../shared/model';
import type { Run } from '../desktop';
import { Field, Toggle, triggerLabel } from '../components/Common';
import { RuleEditor } from '../components/RuleEditor';

export function Presets({ snapshot: s, run }: { snapshot: Snapshot; run: Run }) {
  const [selected, setSelected] = useState(s.settings.activePresetId);
  const [draft, setDraft] = useState<Rule>();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [rename, setRename] = useState('');
  const [impactFilter, setImpactFilter] = useState('ALL');
  const [deleting, setDeleting] = useState(false);
  const preset = s.presets.find((p) => p.id === selected);
  const rules = s.rules.filter((r) => r.presetId === selected);
  const isActive = selected === s.settings.activePresetId;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BUILD YOUR OWN CHAOS</div>
          <h1>
            Presets y reglas<span>.</span>
          </h1>
          <p>Elige qué pasa en el juego cuando tu comunidad participa.</p>
        </div>
        <span className="tag">{s.rules.length} REGLAS · SIN LÍMITE DE CANTIDAD</span>
      </div>
      <section className="panel preset-toolbar">
        <div className="form-row">
          <Field label="Preset">
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setDraft(undefined);
                setRenaming(false);
                setDeleting(false);
              }}
            >
              {s.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === s.settings.activePresetId ? ' · ACTIVO' : ''}
                </option>
              ))}
            </select>
          </Field>
          <button
            className={isActive ? 'secondary' : 'primary'}
            disabled={isActive}
            onClick={() => void run({ op: 'activatePreset', id: selected })}
          >
            <Zap size={15} />
            {isActive ? 'Activo' : 'Activar'}
          </button>
          <button className="secondary" onClick={() => void run({ op: 'duplicatePreset', id: selected })}>
            <Copy size={15} /> Duplicar
          </button>
          <button
            className="quiet"
            onClick={() => {
              setRenaming(!renaming);
              setRename(preset?.name ?? '');
            }}
          >
            Renombrar
          </button>
          <button
            className="quiet"
            disabled={isActive}
            title={isActive ? 'Activa otro preset para eliminar éste' : 'Eliminar preset'}
            onClick={() => {
              if (deleting)
                void run({ op: 'deletePreset', id: selected }).then((r) => {
                  if (r.ok) {
                    setSelected(s.settings.activePresetId);
                    setDeleting(false);
                    setDraft(undefined);
                  }
                });
              else setDeleting(true);
            }}
          >
            <Trash2 size={15} />
            {deleting ? 'Confirmar' : 'Eliminar'}
          </button>
        </div>
        {renaming && preset && (
          <div className="inline-form">
            <input
              aria-label="Nuevo nombre del preset"
              value={rename}
              onChange={(e) => setRename(e.target.value)}
            />
            <button
              onClick={() =>
                void run({ op: 'savePreset', preset: { ...preset, name: rename } }).then((r) => {
                  if (r.ok) setRenaming(false);
                })
              }
            >
              Guardar nombre
            </button>
          </div>
        )}
        <div className="inline-form create-preset">
          <input
            aria-label="Nombre de nuevo preset"
            placeholder="Nombre para un nuevo preset…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="quiet"
            disabled={!newName.trim()}
            onClick={() => {
              const id = crypto.randomUUID();
              void run({ op: 'savePreset', preset: { id, name: newName, createdAt: Date.now() } }).then(
                (r) => {
                  if (r.ok) {
                    setSelected(id);
                    setDraft(undefined);
                    setNewName('');
                  }
                },
              );
            }}
          >
            <Plus size={15} /> Crear preset
          </button>
        </div>
      </section>
      <div className="rules-layout">
        <section className="rule-list">
          <div className="list-heading">
            <h2>
              Reglas <span>{rules.length}</span>
            </h2>
            <button className="small" onClick={() => setDraft(newRule(selected))}>
              <Plus size={15} /> Nueva regla
            </button>
          </div>
          <Field label="Filtrar por impacto">
            <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)}>
              <option value="ALL">Todos los niveles</option>
              {['LOW', 'NORMAL', 'HIGH', 'EPIC'].map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </Field>
          {rules
            .filter((rule) => impactFilter === 'ALL' || (rule.impact ?? 'NORMAL') === impactFilter)
            .map((rule) => (
              <div key={rule.id} className={`rule-tile ${draft?.id === rule.id ? 'selected' : ''}`}>
                <button className="rule-tile-body" onClick={() => setDraft(structuredClone(rule))}>
                  <span className="rule-type">
                    <Zap size={16} />
                  </span>
                  <div>
                    <h3>{rule.name}</h3>
                    <p>{triggerLabel(rule.trigger)}</p>
                    <small>
                      {rule.impact ?? 'NORMAL'} · {rule.actions.length} acciones · prioridad {rule.priority}
                      {s.cooldowns[rule.id]
                        ? ` · Cooldown ${Math.max(0, Math.ceil((s.cooldowns[rule.id]! - Date.now()) / 1000))}s`
                        : ''}
                    </small>
                  </div>
                </button>
                <div className="rule-tile-bottom">
                  <Toggle
                    checked={rule.enabled}
                    label={`Habilitar ${rule.name}`}
                    onChange={() => {
                      void run({ op: 'saveRule', rule: { ...rule, enabled: !rule.enabled } });
                      if (draft?.id === rule.id) setDraft({ ...draft, enabled: !rule.enabled });
                    }}
                  />
                  <button
                    className="text-button"
                    disabled={!isActive}
                    onClick={() => void run({ op: 'testRule', id: rule.id })}
                  >
                    TEST <span>↗</span>
                  </button>
                </div>
              </div>
            ))}
          {!rules.length && (
            <div className="empty">
              <Layers size={32} />
              <p>Este preset está listo para su primera regla.</p>
            </div>
          )}
        </section>
        {draft ? (
          <RuleEditor
            key={`${draft.id}:${draft.enabled}`}
            initial={draft}
            commands={s.commands}
            run={run}
            onSaved={setDraft}
            onDeleted={() => setDraft(undefined)}
          />
        ) : (
          <section className="panel editor-empty">
            <span className="empty-art">
              <Zap size={38} />
            </span>
            <h2>Una interacción. Muchas posibilidades.</h2>
            <p>
              Selecciona una regla o crea una nueva.
              <br />
              Combina comandos, sonidos y pausas en una secuencia.
            </p>
            <button className="primary" onClick={() => setDraft(newRule(selected))}>
              <Plus size={16} /> Crear una regla
            </button>
          </section>
        )}
      </div>
    </>
  );
}
