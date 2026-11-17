import type { Rule } from '../../../shared/model';
import { defaultWindows, performanceTiers } from '../../../shared/performance';
import { Field, NumberField, Toggle } from './Common';

export function RulePublicSettings({ rule, change }: { rule: Rule; change: (rule: Rule) => void }) {
  return (
    <details className="conditions">
      <summary>HUD público y carga estimada</summary>
      <Field label="Etiqueta pública">
        <input
          maxLength={120}
          value={rule.publicLabel ?? ''}
          onChange={(e) => change({ ...rule, publicLabel: e.target.value })}
        />
      </Field>
      <div className="switch-label">
        Visible en HUD
        <Toggle
          label="Visible en HUD"
          checked={rule.showInHud ?? false}
          onChange={() => change({ ...rule, showInHud: !rule.showInHud })}
        />
      </div>
      <NumberField
        label="Orden en HUD"
        value={rule.hudOrder ?? 0}
        max={1000000}
        onChange={(hudOrder) => change({ ...rule, hudOrder })}
      />
      <Field label="Disponibilidad">
        <select
          value={rule.availability ?? 'READY'}
          onChange={(e) => change({ ...rule, availability: e.target.value as Rule['availability'] })}
        >
          <option value="READY">Lista para ejecutar</option>
          <option value="REQUIRES_CONFIGURATION">Requiere configuración</option>
          <option value="REQUIRES_MOD">FUTURE · requiere mod/configuración</option>
        </select>
      </Field>
      <Field
        label="Coste de rendimiento"
        hint="Clasificación manual, independiente del impacto visual. Sin clasificación conserva el comportamiento anterior."
      >
        <select
          value={rule.performanceCost ?? ''}
          onChange={(e) => {
            const cost = e.target.value as Rule['performanceCost'];
            change({
              ...rule,
              performanceCost: cost || undefined,
              performanceWindowMs: cost ? defaultWindows[cost] : undefined,
            });
          }}
        >
          <option value="">Sin clasificación (compatible)</option>
          {performanceTiers.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      {rule.performanceCost && (
        <NumberField
          label="Ventana estimada de carga (segundos)"
          value={(rule.performanceWindowMs ?? defaultWindows[rule.performanceCost]) / 1000}
          max={86400}
          onChange={(n) => change({ ...rule, performanceWindowMs: Math.round(n * 1000) })}
        />
      )}
      <p className="help-text">
        La ventana comienza al terminar la secuencia. LiveForge no mide entidades, efectos ni TPS. Activa la
        protección global en Overlay Studio. FUTURE no se ejecuta ni mediante TEST.
      </p>
    </details>
  );
}
