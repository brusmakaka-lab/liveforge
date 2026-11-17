import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PublicOverlay } from '../shared/overlay-studio';
import { HudScene } from '../renderer/src/components/HudScene';
import { AlertCards } from '../renderer/src/components/AlertCards';
import './overlay.css';

function BrowserOverlay() {
  const [state, setState] = useState<PublicOverlay>();
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function poll() {
      try {
        const response = await fetch('/overlay/state.json', { credentials: 'omit', signal: abort.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next: PublicOverlay = await response.json();
        if (alive) setState(next);
      } catch (error) {
        if (alive) {
          setState(undefined);
          console.warn('LiveForge overlay desconectado', error);
        }
      }
      if (alive) timer = setTimeout(() => void poll(), 500);
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, []);
  if (!state) return null;
  return location.pathname.endsWith('/alerts') ? (
    <div className="browser-alerts">
      <AlertCards alerts={state.alerts} />
    </div>
  ) : (
    <HudScene state={state} />
  );
}
createRoot(document.getElementById('root')!).render(<BrowserOverlay />);
