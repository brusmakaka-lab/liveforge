import type { ConnectionStatus, InternalLiveEvent } from '../shared/model';
export interface LiveProvider {
  connect(username: string): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ConnectionStatus;
}
export type LiveEventSink = (event: InternalLiveEvent) => void;
