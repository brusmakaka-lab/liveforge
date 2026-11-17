import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  ChevronRight,
  FlaskConical,
  LayoutDashboard,
  Layers,
  Settings2,
  Server,
  Square,
  Terminal,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type { Snapshot } from '../../shared/model';
import { AlertCards, useAlerts } from './components/AlertCards';
import { AudioPlayer } from './components/AudioPlayer';
import type { Request, Run } from './desktop';
import { Dashboard } from './pages/Dashboard';
import { Presets } from './pages/Presets';
import { Commands } from './pages/Commands';
import { Simulator } from './pages/Simulator';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';
import { ServerHubPage } from './pages/ServerHub';
import { OverlayStudio } from './pages/OverlayStudio';

const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
  { id: 'presets', name: 'Presets y reglas', icon: Layers },
  { id: 'commands', name: 'Command library', icon: BookOpen },
  { id: 'simulator', name: 'Simulator', icon: FlaskConical },
  { id: 'studio', name: 'Overlay Studio', icon: Layers },
  { id: 'logs', name: 'Logs / Diagnostics', icon: Terminal },
  { id: 'server', name: 'Minecraft Server Hub', icon: Server },
  { id: 'settings', name: 'Settings', icon: Settings2 },
] as const;
type Page = (typeof navigation)[number]['id'];
export function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const contentRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const alerts = useAlerts();
  const refresh = useCallback(async () => {
    const response = await window.liveforge.request({ op: 'snapshot' });
    if (response.ok && response.snapshot) setSnapshot(response.snapshot);
    else if (!response.ok) setNotice({ text: response.error, error: true });
  }, []);
  const run: Run = useCallback(
    async (input: Request) => {
      try {
        const response = await window.liveforge.request(input);
        if (!response.ok) setNotice({ text: response.error, error: true });
        else if (response.text) setNotice({ text: response.text, error: false });
        await refresh();
        return response;
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        setNotice({ text, error: true });
        return { ok: false, error: text };
      }
    },
    [refresh],
  );
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh();
      } catch (error) {
        setNotice({ text: String(error), error: true });
      }
      if (alive)
        timer = setTimeout(() => {
          void poll();
        }, 600);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(undefined), notice.error ? 12_000 : 4000);
    return () => clearTimeout(timeout);
  }, [notice]);
  if (!snapshot)
    return (
      <main className="fatal">
        <Zap size={40} />
        <h1>LiveForge</h1>
        <p>{notice?.text || 'Iniciando el motor local…'}</p>
      </main>
    );
  const current = navigation.find((item) => item.id === page)!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>
            <Zap size={23} fill="currentColor" />
          </span>
          <div>
            LiveForge<small>LIVE INTERACTION ENGINE</small>
          </div>
        </div>
        <div className="workspace">
          <span className="workspace-icon">MC</span>
          <div>
            Minecraft<small>Local workspace</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <p className="nav-label">CONTROL ROOM</p>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={18} />
              {item.name}
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <i />
            <span>
              Todo corre en tu PC<small>Sin cuentas. Sin nube.</small>
            </span>
          </div>
          <span className="version">
            TEST · VALIDACIÓN <b>v0.4.0-test.1</b>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{current.name}</strong>
          </div>
          <div className="topbar-right">
            <span className={`state-pill ${snapshot.eventsEnabled ? 'green' : ''}`}>
              <i />
              {snapshot.eventsEnabled ? 'Events activos' : 'Events detenidos'}
            </span>
            <button
              className="icon-button"
              aria-label={snapshot.settings.audio.mute ? 'Activar audio' : 'Silenciar audio'}
              onClick={() =>
                void run({
                  op: 'saveSettings',
                  settings: {
                    ...snapshot.settings,
                    audio: { ...snapshot.settings.audio, mute: !snapshot.settings.audio.mute },
                  },
                })
              }
            >
              {snapshot.settings.audio.mute ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <span className="avatar">A</span>
          </div>
        </header>
        <main className="content" ref={contentRef}>
          {page === 'dashboard' && <Dashboard snapshot={snapshot} run={run} navigate={setPage} />}
          {page === 'presets' && <Presets snapshot={snapshot} run={run} />}
          {page === 'commands' && <Commands snapshot={snapshot} run={run} />}
          {page === 'simulator' && <Simulator snapshot={snapshot} run={run} />}
          {page === 'logs' && <Logs snapshot={snapshot} run={run} />}
          {page === 'settings' && <Settings initial={snapshot.settings} snapshot={snapshot} run={run} />}
          {page === 'server' && <ServerHubPage snapshot={snapshot} run={run} />}
          {page === 'studio' && <OverlayStudio snapshot={snapshot} run={run} />}
        </main>
        <footer className="statusbar">
          <span>
            <Activity size={13} /> Motor local · {snapshot.queuePaused ? 'cola pausada' : 'cola lista'} ·{' '}
            {snapshot.dryRun ? 'DRY RUN' : 'comandos reales'}
          </span>
          <button className="emergency-small" onClick={() => void run({ op: 'stopEvents' })}>
            <Square size={11} fill="currentColor" /> STOP ALL EVENTS
          </button>
        </footer>
      </div>
      {notice && (
        <div
          role="status"
          className={`toast ${notice.error ? 'error' : ''}`}
          onClick={() => setNotice(undefined)}
        >
          {notice.text}
        </div>
      )}
      <AudioPlayer />
      <div className="desktop-alerts">
        <AlertCards alerts={alerts} />
      </div>
    </div>
  );
}
