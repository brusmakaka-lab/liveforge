import { OverlayControls } from '../components/OverlayControls';
import { useState } from 'react';
import { Check, FlaskConical, LockKeyhole, Save } from 'lucide-react';
import type { Settings as SettingsModel, Snapshot } from '../../../shared/model';
import { settingsSchema } from '../../../shared/model';
import type { Run } from '../desktop';
import { Field, NumberField, Status, Toggle } from '../components/Common';

export function Settings({
  initial,
  snapshot: s,
  run,
}: {
  initial: SettingsModel;
  snapshot: Snapshot;
  run: Run;
}) {
  const [settings, setSettings] = useState(initial);
  const [password, setPassword] = useState('');
  const [signKey, setSignKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (next: SettingsModel): void => {
    setSettings(next);
    setSaved(false);
  };
  const save = async (test = false): Promise<void> => {
    const parsed = settingsSchema.safeParse(settings);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
      return;
    }
    setBusy(true);
    setError('');
    const response = await run({
      op: 'saveSettings',
      settings: parsed.data,
      password: password || undefined,
      signKey: signKey || undefined,
    });
    if (response.ok) {
      setSaved(true);
      setPassword('');
      setSignKey('');
      if (test) await run({ op: 'testGame' });
    }
    setBusy(false);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>
            Settings<span>.</span>
          </h1>
          <p>Conecta tu LIVE, tu servidor y tu forma de jugar.</p>
        </div>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {saved ? <Check size={16} /> : <Save size={16} />}{' '}
          {saved ? 'Configuración guardada' : 'Guardar configuración'}
        </button>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>TikTok LIVE</h2>
            <Status value={s.live} />
          </div>
          <div className="editor-body">
            <Field label="TikTok username" hint="Tu @usuario, sin la URL del perfil.">
              <input
                placeholder="@tu_usuario"
                value={settings.tiktokUsername}
                onChange={(e) => change({ ...settings, tiktokUsername: e.target.value })}
              />
            </Field>
            <Field
              label="Signing API key (opcional)"
              hint={
                s.hasSignKey
                  ? 'Hay una clave cifrada guardada. Deja vacío para conservarla.'
                  : 'Sólo si el servicio de firma del conector la requiere.'
              }
            >
              <input
                type="password"
                autoComplete="off"
                value={signKey}
                onChange={(e) => setSignKey(e.target.value)}
              />
            </Field>
            <p className="help-text">
              Proveedor no oficial: TikTok LIVE Connector 2.5. La firma WebSocket usa un servicio externo. No
              se solicita tu contraseña ni cookies de TikTok.
            </p>
            <p className="help-text">
              Al reconectar se conserva la sesión. Conectar manualmente inicia una nueva sesión y detiene los
              eventos hasta que pulses START EVENTS.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Minecraft / RCON</h2>
            <Status value={s.game} />
          </div>
          <div className="editor-body">
            <Field label="Minecraft player">
              <input
                value={settings.player}
                onChange={(e) => change({ ...settings, player: e.target.value })}
              />
            </Field>
            <div className="form-row">
              <Field label="RCON host">
                <select
                  value={settings.minecraft.host}
                  onChange={(e) =>
                    change({
                      ...settings,
                      minecraft: {
                        ...settings.minecraft,
                        host: e.target.value as SettingsModel['minecraft']['host'],
                      },
                    })
                  }
                >
                  <option>127.0.0.1</option>
                  <option>localhost</option>
                  <option>::1</option>
                </select>
              </Field>
              <NumberField
                label="RCON port"
                value={settings.minecraft.port}
                min={1}
                max={65535}
                onChange={(port) => change({ ...settings, minecraft: { ...settings.minecraft, port } })}
              />
            </div>
            <Field
              label="RCON password"
              hint={
                s.hasPassword
                  ? 'Contraseña cifrada guardada. Deja vacío para conservarla.'
                  : 'Debe coincidir con rcon.password en server.properties.'
              }
            >
              <input
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button className="secondary" disabled={busy} onClick={() => void save(true)}>
              <FlaskConical size={16} /> Guardar y probar conexión
            </button>
            <p className="help-text">
              La prueba envía «list» y mide la latencia. Requiere enable-rcon=true y reiniciar el servidor.
              RCON permanece local.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Audio</h2>
            <div className="switch-label">
              Mute{' '}
              <Toggle
                checked={settings.audio.mute}
                label="Mute"
                onChange={() =>
                  change({ ...settings, audio: { ...settings.audio, mute: !settings.audio.mute } })
                }
              />
            </div>
          </div>
          <div className="editor-body">
            <Field label={`Master volume · ${Math.round(settings.audio.volume * 100)}%`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.audio.volume}
                onChange={(e) =>
                  change({ ...settings, audio: { ...settings.audio, volume: Number(e.target.value) } })
                }
              />
            </Field>
            <p className="help-text">
              MP3, WAV y OGG locales. Un fallo de audio se registra y la secuencia continúa.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Developer options</h2>
            <span className="tag">LOCAL</span>
          </div>
          <div className="editor-body">
            <Field
              label="Seed para Action Pools"
              hint="Vacío = aleatorio. Al guardar, una seed reinicia la secuencia determinista."
            >
              <input
                value={settings.developer.randomSeed}
                placeholder="ej. mi-live-01"
                onChange={(e) =>
                  change({ ...settings, developer: { ...settings.developer, randomSeed: e.target.value } })
                }
              />
            </Field>
            <div className="switch-label">
              Guardar raw temporal en diagnóstico{' '}
              <Toggle
                checked={settings.developer.retainRaw}
                label="Retener eventos raw"
                onChange={() =>
                  change({
                    ...settings,
                    developer: { ...settings.developer, retainRaw: !settings.developer.retainRaw },
                  })
                }
              />
            </div>
            <p className="help-text">
              Máximo 20 eventos raw en memoria. Pueden incluir usernames y datos públicos del LIVE.
            </p>
            <NumberField
              label="Retención de logs (días)"
              value={settings.logRetentionDays}
              min={1}
              max={30}
              onChange={(logRetentionDays) => change({ ...settings, logRetentionDays })}
            />
          </div>
        </section>
      </div>
      <OverlayControls snapshot={s} run={run} />
      {error && <pre className="inline-error">{error}</pre>}
      <div className="setup-note">
        <LockKeyhole size={17} /> Las claves se cifran con Windows DPAPI y nunca se devuelven a la interfaz.
        Los cambios de conexión requieren reconectar.
      </div>
    </>
  );
}
