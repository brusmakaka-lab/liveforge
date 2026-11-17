import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Play, RotateCcw, Save, Square } from 'lucide-react';
import type { Snapshot } from '../../../shared/model';
import {
  serverLocations,
  type ServerConfig,
  type ServerInspection,
  type ServerSnapshot,
} from '../../../shared/server';
import type { Request, Run } from '../desktop';
import { Field, NumberField } from '../components/Common';

export function ServerHubPage({ snapshot, run }: { snapshot: Snapshot; run: Run }) {
  const [config, setConfig] = useState<ServerConfig>(
    snapshot.settings.localServer ?? { root: '', entry: '', stopTimeout: 60 },
  );
  const [inspection, setInspection] = useState<ServerInspection>();
  const [server, setServer] = useState<ServerSnapshot>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);
  const saved = snapshot.settings.localServer;
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const active = server?.active ?? false;
  const blocked = busy || server?.busy;
  const inspect = async (root: string): Promise<void> => {
    try {
      const response = await window.liveforge.request({ op: 'serverInspect', root });
      if (response.ok && response.inspection) {
        setInspection(response.inspection);
        setError('');
      } else {
        setInspection(undefined);
        setError(response.ok ? 'No se recibió la inspección' : response.error);
      }
    } catch (e) {
      setInspection(undefined);
      setError(String(e));
    }
  };
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await window.liveforge.request({ op: 'serverStatus' });
        if (alive) {
          if (response.ok) setServer(response.server);
          else setError(response.error);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
      if (alive) timer = setTimeout(() => void poll(), 600);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (autoscroll && consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [server?.logs.at(-1)?.id, autoscroll]);
  const operation = async (request: Request): Promise<boolean> => {
    setBusy(true);
    try {
      const response = await run(request);
      setError(response.ok ? '' : response.error);
      return response.ok;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL SERVER / OPTIONAL</div>
          <h1>
            Minecraft Server Hub<span>.</span>
          </h1>
          <p>Administra un proceso local. RCON sigue configurándose por separado en Settings.</p>
        </div>
        <span className={`tag ${server?.state === 'ONLINE' ? 'green' : ''}`} role="status">
          {server?.state ?? 'OFFLINE'}
        </span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Carpeta e inicio</h2>
        </div>
        <div className="editor-body">
          <Field label="Carpeta raíz del servidor">
            <div className="input-with-button">
              <input
                value={config.root}
                disabled={active}
                placeholder="Selecciona la carpeta de tu servidor"
                onChange={(e) => {
                  setConfig({ ...config, root: e.target.value, entry: '' });
                  setInspection(undefined);
                }}
              />
              <button
                className="secondary"
                disabled={active || busy}
                onClick={() => {
                  void run({ op: 'chooseServerRoot' }).then(async (r) => {
                    if (r.ok && r.text) {
                      setConfig({ ...config, root: r.text, entry: '' });
                      await inspect(r.text);
                    }
                  });
                }}
              >
                <FolderOpen size={16} />
                Elegir carpeta
              </button>
            </div>
          </Field>
          <div className="button-row">
            <button
              className="quiet"
              disabled={!config.root || busy}
              onClick={() => void inspect(config.root)}
            >
              Detectar archivos / actualizar accesos
            </button>
          </div>
          <Field
            label="Archivo de inicio"
            hint=".bat/.cmd en primer plano, sin start, pause ni bucles de reinicio; o .jar con Java del PATH. No se modifican archivos del servidor."
          >
            <select
              value={config.entry}
              disabled={active}
              onChange={(e) => setConfig({ ...config, entry: e.target.value })}
            >
              <option value="">Seleccionar inicio…</option>
              {config.entry && !inspection?.entries.includes(config.entry) && <option>{config.entry}</option>}
              {inspection?.entries.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </Field>
          <NumberField
            label="Tiempo máximo de cierre seguro (segundos)"
            value={config.stopTimeout}
            min={5}
            max={180}
            onChange={(stopTimeout) => setConfig({ ...config, stopTimeout })}
          />
          <button
            className="primary"
            disabled={active || busy || !config.entry}
            onClick={() => void operation({ op: 'serverSave', config })}
          >
            <Save size={16} />
            Guardar servidor
          </button>
          {dirty && (
            <p className="help-text">
              Guarda la configuración antes de iniciar o abrir accesos. No se inicia automáticamente.
            </p>
          )}
        </div>
      </section>
      <section className="panel server-panel">
        <div className="panel-heading">
          <h2>Proceso administrado</h2>
          <span>PID: {server?.pid ?? '—'}</span>
        </div>
        <div className="editor-body">
          <p>
            Uptime:{' '}
            {server?.startedAt ? `${Math.max(0, Math.floor((Date.now() - server.startedAt) / 1000))} s` : '—'}{' '}
            · Salida: {server?.exitCode ?? '—'}
          </p>
          <div className="button-row">
            <button
              className="primary"
              disabled={blocked || active || !saved || dirty}
              onClick={() => void operation({ op: 'serverStart' })}
            >
              <Play size={16} />
              Iniciar servidor
            </button>
            <button
              className="secondary"
              disabled={blocked || !active}
              onClick={() => void operation({ op: 'serverStop' })}
            >
              <Square size={16} />
              Detener servidor
            </button>
            <button
              className="secondary"
              disabled={blocked || !active || dirty}
              onClick={() => void operation({ op: 'serverRestart' })}
            >
              <RotateCcw size={16} />
              Reiniciar servidor
            </button>
          </div>
          <p className="help-text">
            ONLINE requiere la línea «Done (…)!» del servidor. STARTING puede durar varios minutos. STOP ALL
            EVENTS detiene las reglas; el servidor se detiene con este botón. Al cerrar LiveForge podrás
            detener el servidor o cancelar el cierre. Nunca se fuerza Java.
          </p>
          {(error || server?.error) && (
            <pre className="inline-error" role="alert">
              {error || server?.error}
            </pre>
          )}
        </div>
      </section>
      <section className="panel server-panel">
        <div className="panel-heading">
          <h2>Consola del servidor</h2>
          <label>
            <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />{' '}
            Autoscroll
          </label>
        </div>
        <div ref={consoleRef} className="server-console" role="log" aria-label="Consola del servidor">
          {!server?.logs.length && (
            <p>Sin salida del proceso. Los servidores iniciados fuera del Hub no se administran aquí.</p>
          )}
          {server?.logs.map((line) => (
            <div key={line.id} className={`server-line ${line.level.toLowerCase()}`}>
              <time>{new Date(line.time).toLocaleTimeString()}</time> [{line.level}] {line.text}
            </div>
          ))}
        </div>
        <form
          className="editor-body"
          onSubmit={(e) => {
            e.preventDefault();
            void operation({ op: 'serverCommand', command }).then((ok) => {
              if (ok) setCommand('');
            });
          }}
        >
          <Field
            label="Comando de consola"
            hint="Se envía a stdin del servidor administrado. Es un comando real, incluso con DRY RUN; no es un comando de shell."
          >
            <input value={command} maxLength={4096} onChange={(e) => setCommand(e.target.value)} />
          </Field>
          <button className="secondary" disabled={blocked || server?.state !== 'ONLINE' || !command.trim()}>
            Enviar comando
          </button>
          <p className="help-text">
            Se conservan hasta 500 líneas de 4.096 caracteres en memoria; no se guardan indefinidamente.
          </p>
        </form>
      </section>
      <section className="panel server-panel">
        <div className="panel-heading">
          <h2>Accesos del sistema</h2>
        </div>
        <div className="editor-body">
          <p className="help-text">
            Pulsa «Detectar archivos / actualizar accesos». Ubicaciones inexistentes o inaccesibles quedan
            deshabilitadas. server.properties se selecciona en el Explorador.
          </p>
          <div className="button-row server-locations">
            {serverLocations.map((location) => (
              <button
                className="quiet"
                key={location}
                disabled={dirty || !inspection?.locations[location]}
                onClick={() => void operation({ op: 'serverOpen', location })}
              >
                <FolderOpen size={14} />
                {location === 'root' ? 'Carpeta raíz' : location}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
