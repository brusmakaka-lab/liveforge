import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, MediaMessage, Request } from '../shared/api';

const api: DesktopAPI = {
  request: (input: Request) => ipcRenderer.invoke('liveforge:request', input),
  onMedia: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: MediaMessage): void => listener(message);
    ipcRenderer.on('liveforge:media', handler);
    return () => ipcRenderer.removeListener('liveforge:media', handler);
  },
};
contextBridge.exposeInMainWorld('liveforge', api);
