import { useState } from 'react';
import type { Snapshot } from '../../../shared/model';
import { defaultStudio, type StudioSettings } from '../../../shared/overlay-studio';
import { defaultPerformance, performanceTiers } from '../../../shared/performance';
import type { Run } from '../desktop';
import { Field, NumberField, Toggle } from '../components/Common';
import { HudScene } from '../components/HudScene';
import '../components/hud.css';

export function OverlayStudio({ snapshot, run }: { snapshot: Snapshot; run: Run }) {
  const [layout, setLayout] = useState(() => snapshot.settings.overlayStudio ?? defaultStudio());
  const [protection, setProtection] = useState(
    () => snapshot.settings.performanceProtection ?? defaultPerformance(),
  );
  const rules = snapshot.rules
    .filter((r) => r.presetId === snapshot.settings.activePresetId)
    .sort((a, b) => (a.hudOrder ?? 0) - (b.hudOrder ?? 0));
  const number = (
    key: 'x' | 'y' | 'columns' | 'gap' | 'iconSize' | 'textSize' | 'port',
    label: string,
    min: number,
    max: number,
  ) => (
    <NumberField
      key={key}
      label={label}
      value={layout[key]}
      min={min}
      max={max}
      onChange={(n) => setLayout({ ...layout, [key]: n })}
    />
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Overlay Studio</h1>
          <p>HUD público del preset activo · Browser Source local</p>
        </div>
        <button className="secondary" onClick={() => void run({ op: 'createBedrockPreset' })}>
          Crear preset Bedrock
        </button>
      </div>
      <div className="studio-grid">
        <section className="panel">
          <div className="editor-body">
            <h2>Browser Source · {snapshot.overlayHttp?.state ?? 'OFFLINE'}</h2>
            {snapshot.overlayHttp?.error && <p role="alert">{snapshot.overlayHttp.error}</p>}
            <p className="help-text">
              Sólo 127.0.0.1. Expone etiquetas e imágenes públicas; no comandos ni configuración privada.
            </p>
            {(['enabled', 'hudEnabled', 'showPrice', 'showGift', 'showLabel'] as const).map((key, i) => (
              <div className="switch-label" key={key}>
                {
                  [
                    'Servidor local',
                    'HUD visible',
                    'Precio observado',
                    'Regalo / trigger',
                    'Efecto / etiqueta',
                  ][i]
                }
                <Toggle
                  label={
                    [
                      'Servidor local',
                      'HUD visible',
                      'Precio observado',
                      'Regalo / trigger',
                      'Efecto / etiqueta',
                    ][i]!
                  }
                  checked={layout[key]}
                  onChange={() => setLayout({ ...layout, [key]: !layout[key] })}
                />
              </div>
            ))}
            {number('port', 'Puerto local', 1024, 65535)}
            <Field label="Canvas">
              <select
                value={layout.orientation}
                onChange={(e) =>
                  setLayout({ ...layout, orientation: e.target.value as StudioSettings['orientation'] })
                }
              >
                <option value="VERTICAL">Vertical · 1080 × 1920</option>
                <option value="HORIZONTAL">Horizontal · 1920 × 1080</option>
              </select>
            </Field>
            <Field label="Alineación">
              <select
                value={layout.align}
                onChange={(e) => setLayout({ ...layout, align: e.target.value as StudioSettings['align'] })}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </select>
            </Field>
            <NumberField
              label="Escala (%)"
              value={layout.scale * 100}
              min={25}
              max={200}
              onChange={(n) => setLayout({ ...layout, scale: n / 100 })}
            />
            <div className="form-row">
              {number('x', 'Margen X', 0, 1920)}
              {number('y', 'Margen Y', 0, 1920)}
            </div>
            <div className="form-row">
              {number('columns', 'Columnas', 1, 6)}
              {number('gap', 'Separación', 0, 80)}
            </div>
            <div className="form-row">
              {number('iconSize', 'Tamaño de icono', 24, 160)}
              {number('textSize', 'Tamaño de texto', 12, 64)}
            </div>
            <button className="primary" onClick={() => void run({ op: 'saveStudio', settings: layout })}>
              Guardar Studio / reintentar
            </button>
            {(['hud', 'alerts'] as const).map((view) => (
              <div key={view}>
                <p>
                  http://127.0.0.1:{snapshot.overlayHttp?.port ?? layout.port}/overlay/{view}
                </p>
                <button
                  disabled={snapshot.overlayHttp?.state !== 'ONLINE'}
                  onClick={() => void run({ op: 'copyOverlayUrl', view })}
                >
                  Copiar URL {view}
                </button>{' '}
                <button
                  disabled={snapshot.overlayHttp?.state !== 'ONLINE'}
                  onClick={() => void run({ op: 'openOverlayPreview', view })}
                >
                  Abrir {view}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="editor-body">
            <h2>Preview del HUD</h2>
            <p className="help-text">
              Composición local. No ejecuta reglas. Los cambios llegan al Browser Source al guardar. Revisa
              que las tarjetas entren dentro del canvas; los márgenes/escala pueden recortarlas.
            </p>
            <div className="studio-preview" style={{ height: layout.orientation === 'VERTICAL' ? 640 : 360 }}>
              <div style={{ transform: 'scale(0.333333)', transformOrigin: 'top left' }}>
                <HudScene state={{ layout, items: snapshot.publicOverlay?.items ?? [], alerts: [] }} />
              </div>
            </div>
            <h3>Reglas del preset activo</h3>
            <p className="help-text">
              Sólo reglas habilitadas, listas, visibles y con etiqueta. Edita coste, ventana, imágenes y
              acciones desde Presets y reglas.
            </p>
            {rules.map((rule) => (
              <div className="studio-rule" key={rule.id}>
                <strong>{rule.publicLabel || rule.name}</strong>
                <span>
                  {rule.impact ?? 'NORMAL'} / {rule.performanceCost ?? 'sin clasificación'}
                </span>
                <Toggle
                  label={`HUD ${rule.name}`}
                  checked={rule.showInHud ?? false}
                  onChange={() => void run({ op: 'saveRule', rule: { ...rule, showInHud: !rule.showInHud } })}
                />
                <Field label={`Etiqueta ${rule.name}`}>
                  <input
                    key={`${rule.id}-${rule.publicLabel}`}
                    defaultValue={rule.publicLabel ?? ''}
                    maxLength={120}
                    onBlur={(e) => {
                      if (e.target.value !== (rule.publicLabel ?? ''))
                        void run({ op: 'saveRule', rule: { ...rule, publicLabel: e.target.value } });
                    }}
                  />
                </Field>
                <Field label={`Orden ${rule.name}`}>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    key={`${rule.id}-${rule.hudOrder}`}
                    defaultValue={rule.hudOrder ?? 0}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== (rule.hudOrder ?? 0))
                        void run({ op: 'saveRule', rule: { ...rule, hudOrder: n } });
                    }}
                  />
                </Field>
              </div>
            ))}
            {!rules.length && <p>Activa un preset desde Presets y reglas.</p>}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="editor-body">
          <h2>Protección por carga estimada</h2>
          <p>
            LiveForge no mide entidades, efectos ni TPS dentro de Minecraft. Las reservas cuentan secuencias,
            no mobs. Los límites de cada nivel son independientes.
          </p>
          <div className="switch-label">
            Activar protección
            <Toggle
              label="Activar protección"
              checked={protection.enabled}
              onChange={() => setProtection({ ...protection, enabled: !protection.enabled })}
            />
          </div>
          <Field label="Sin capacidad">
            <select
              value={protection.policy}
              onChange={(e) => setProtection({ ...protection, policy: e.target.value as 'WAIT' | 'DROP' })}
            >
              <option value="WAIT">WAIT · esperar capacidad</option>
              <option value="DROP">DROP · descartar con motivo en Logs</option>
            </select>
          </Field>
          {performanceTiers.map((tier) => (
            <div key={tier}>
              <h3>{tier}</h3>
              <div className="form-row">
                {(['capacity', 'cooldownMs', 'perItemCap'] as const).map((key, i) => (
                  <NumberField
                    key={key}
                    label={`${tier} ${['cupos', 'cooldown global (ms)', 'máximo PER_ITEM por acción'][i]}`}
                    value={protection.tiers[tier][key]}
                    min={key === 'cooldownMs' ? 0 : 1}
                    max={key === 'cooldownMs' ? 86400000 : key === 'capacity' ? 100 : 1000}
                    onChange={(n) =>
                      setProtection({
                        ...protection,
                        tiers: { ...protection.tiers, [tier]: { ...protection.tiers[tier], [key]: n } },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <button
            className="primary"
            onClick={() => void run({ op: 'savePerformance', settings: protection })}
          >
            Guardar protección
          </button>
          <p className="help-text">
            Las reglas antiguas sin coste explícito conservan su comportamiento. STOP cancela pendientes;
            conserva ventanas ya iniciadas y no elimina efectos. Reiniciar conserva reservas reales; DRY RUN
            usa reservas separadas en memoria.
          </p>
          {snapshot.performance?.reservations.map((r) => (
            <p key={r.id}>
              {r.tier} · {r.simulated ? 'DRY RUN' : 'real'} ·{' '}
              {r.active ? 'secuencia en ejecución' : `vence ${new Date(r.until).toLocaleTimeString()}`}
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
