import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { Repository } from '../storage/repository';
import { OverlayWindow } from './overlay-window';
import { Runtime } from './runtime';
import { errorMessage } from '../core/logging';

app.setName('LiveForge');
if (process.env.LIVEFORGE_DATA_DIR) app.setPath('userData', process.env.LIVEFORGE_DATA_DIR);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  let window: BrowserWindow | undefined;
  let runtime: Runtime | undefined;
  let exiting = false;
  let closing = false;
  const overlay = new OverlayWindow();
  app.on('second-instance', () => {
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(() => {
      mkdirSync(app.getPath('userData'), { recursive: true });
      runtime = new Runtime(
        new Repository(join(app.getPath('userData'), 'liveforge.sqlite')),
        (message) => {
          if (window && !window.isDestroyed()) window.webContents.send('liveforge:media', message);
          if (message.type === 'alerts') overlay.send(message.alerts);
        },
        (settings) => overlay.configure(settings),
      );
      const renderer = join(import.meta.dirname, '../renderer/index.html');
      const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
      const expected = devUrl ? new URL(devUrl).toString() : pathToFileURL(renderer).toString();
      window = new BrowserWindow({
        width: 1440,
        height: 950,
        minWidth: 1050,
        minHeight: 720,
        title: 'LiveForge',
        backgroundColor: '#0d1014',
        autoHideMenuBar: true,
        show: true,
        webPreferences: {
          preload: join(import.meta.dirname, '../preload/index.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== expected) event.preventDefault();
      });
      window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      ipcMain.handle('liveforge:request', (event, input: unknown) => {
        if (overlay.owns(event)) {
          if (input && typeof input === 'object' && 'op' in input && input.op === 'mediaReady')
            return { ok: true, alerts: overlay.snapshot };
          return { ok: false, error: 'El overlay sólo puede consultar alertas' };
        }
        if (
          event.sender !== window?.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== expected
        )
          return { ok: false, error: 'IPC no autorizado' };
        if (input && typeof input === 'object' && 'op' in input && input.op === 'mediaReady')
          return { ok: true, alerts: runtime!.alerts };
        return runtime!.request(input);
      });
      if (devUrl) void window.loadURL(devUrl);
      else void window.loadFile(renderer);
      const overlaySettings = runtime.snapshot().settings.overlay;
      if (overlaySettings) overlay.configure(overlaySettings);
      window.on('closed', () => {
        window = undefined;
        app.quit();
      });
      window.on('close', (event) => {
        if (!exiting && runtime?.server.active) {
          event.preventDefault();
          app.quit();
        }
      });
    })
    .catch((error) => {
      process.stderr.write(`Startup failed: ${errorMessage(error)}\n`);
      app.exit(1);
    });
  process.on('unhandledRejection', (error) => {
    runtime?.log.write('ERROR', 'SYSTEM', `Unhandled rejection: ${errorMessage(error)}`);
  });
  app.on('before-quit', (event) => {
    if (!exiting && runtime) {
      event.preventDefault();
      if (closing) return;
      closing = true;
      const current = runtime;
      void (async () => {
        try {
          if (current.server.active) {
            const answer = await dialog.showMessageBox({
              type: 'question',
              title: 'Servidor local activo',
              message: '¿Detener el servidor de forma segura antes de cerrar LiveForge?',
              detail:
                'Se enviará stop y se esperará el cierre. No se forzará Java. Cancelar mantiene LiveForge abierto.',
              buttons: ['Cancelar', 'Detener y cerrar'],
              defaultId: 0,
              cancelId: 0,
            });
            if (answer.response !== 1) return;
            await current.server.stop(current.snapshot().settings.localServer?.stopTimeout ?? 60);
          }
          await current.shutdown();
          exiting = true;
          app.quit();
        } catch (error) {
          process.stderr.write(`Shutdown: ${errorMessage(error)}\n`);
          await dialog.showMessageBox({
            type: 'error',
            message: 'LiveForge permanece abierto',
            detail: errorMessage(error),
          });
        } finally {
          closing = false;
        }
      })();
    }
  });
}
