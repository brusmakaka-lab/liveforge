import type { DesktopAPI, Reply, Request } from '../../shared/api';
export type { Request } from '../../shared/api';
declare global {
  interface Window {
    liveforge: DesktopAPI;
  }
}
export type Run = (request: Request) => Promise<Reply>;
