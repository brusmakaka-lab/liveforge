import { createRoot } from 'react-dom/client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { OverlayScene } from './components/AlertCards';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error', error, info.componentStack);
  }
  render(): ReactNode {
    return this.state.error ? (
      <main className="fatal">
        <h1>No se pudo mostrar la interfaz</h1>
        <p>{this.state.error}</p>
        <button
          onClick={() => {
            void window.liveforge.request({ op: 'stopEvents' }).finally(() => location.reload());
          }}
        >
          Detener eventos y recargar
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const overlay = location.hash === '#overlay';
if (overlay) document.documentElement.classList.add('overlay-root');
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>{overlay ? <OverlayScene /> : <App />}</ErrorBoundary>,
);
