import { useState } from 'react';
import type { Snapshot } from '../../../shared/model';
import type { Run } from '../desktop';
import { NumberField } from './Common';

export function OverlayControls({ snapshot, run }: { snapshot: Snapshot; run: Run }) {
  const saved = snapshot.settings.overlay ?? { visible: false, locked: true, x: 40, y: 40 };
  const [x, setX] = useState(saved.x);
  const [y, setY] = useState(saved.y);
  return (
    <section className="panel overlay-controls">
      <div className="panel-heading">
        <h2>Overlay vertical</h2>
        <span className="tag">480 × 854</span>
      </div>
      <div className="editor-body">
        <p>Captura la ventana «LiveForge Overlay v0.2». El audio sale de LiveForge una sola vez.</p>
        <div className="form-row">
          <NumberField label="Overlay · posición X" value={x} min={-20000} max={20000} onChange={setX} />
          <NumberField label="Overlay · posición Y" value={y} min={-20000} max={20000} onChange={setY} />
        </div>
        <div className="button-row">
          <button
            className="secondary"
            onClick={() => void run({ op: 'overlay', ...saved, x, y, visible: !saved.visible })}
          >
            {saved.visible ? 'Ocultar overlay' : 'Abrir overlay'}
          </button>
          <button
            className="secondary"
            onClick={() => void run({ op: 'overlay', ...saved, x, y, visible: true })}
          >
            Aplicar posición
          </button>
          <button
            className="quiet"
            onClick={() => void run({ op: 'overlay', ...saved, x, y, locked: !saved.locked })}
          >
            {saved.locked ? 'Desbloquear overlay' : 'Bloquear overlay'}
          </button>
        </div>
        <small>
          Bloqueado: los clics pasan al juego. Desbloqueado: arrastra una tarjeta. No toma el foco. La
          posición se guarda con «Aplicar posición».
        </small>
      </div>
    </section>
  );
}
