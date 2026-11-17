import { app, BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Settings } from '../shared/model';
import type { AlertView } from '../shared/media';

export class OverlayWindow {
  private window?: BrowserWindow;
  private alerts: AlertView[] = [];
  private expected = '';
  configure(settings: NonNullable<Settings['overlay']>): void {
    if (!settings.visible) {
      this.window?.hide();
      return;
    }
    if (!this.window || this.window.isDestroyed()) this.create();
    const win = this.window!;
    const display = screen.getDisplayNearestPoint({ x: settings.x, y: settings.y }).workArea;
    win.setPosition(
      Math.max(display.x, Math.min(settings.x, display.x + display.width - 480)),
      Math.max(display.y, Math.min(settings.y, display.y + display.height - 100)),
    );
    win.setIgnoreMouseEvents(settings.locked, { forward: true });
    win.showInactive();
  }
  private create(): void {
    const win = new BrowserWindow({
      width: 480,
      height: 854,
      transparent: true,
      frame: false,
      resizable: false,
      focusable: false,
      alwaysOnTop: true,
      hasShadow: false,
      title: 'LiveForge Overlay v0.2',
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    this.window = win;
    const renderer = join(import.meta.dirname, '../renderer/index.html');
    const dev = process.env.ELECTRON_RENDERER_URL;
    // The same local bundle exposes a dedicated presentation-only entry via its hash.
    this.expected =
      dev && !app.isPackaged
        ? `${dev.replace(/\/$/, '')}/#overlay`
        : `${pathToFileURL(renderer).href}#overlay`;
    win.on('page-title-updated', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== this.expected) event.preventDefault();
    });
    win.on('closed', () => {
      this.window = undefined;
    });
    void win.loadURL(this.expected);
  }
  owns(event: Electron.IpcMainInvokeEvent): boolean {
    return (
      event.sender === this.window?.webContents &&
      event.senderFrame === this.window.webContents.mainFrame &&
      event.senderFrame.url === this.expected
    );
  }
  send(alerts: AlertView[]): void {
    this.alerts = alerts;
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send('liveforge:media', { type: 'alerts', alerts });
  }
  get snapshot(): AlertView[] {
    return this.alerts;
  }
}
