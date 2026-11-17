import type { ConnectionStatus } from '../shared/model';
import type { AlertDetails, Impact } from '../shared/media';

export interface GameAdapter<TAction = unknown> {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  execute(action: TAction): Promise<string>;
  testConnection(): Promise<{ response: string; latency: number }>;
  getStatus(): ConnectionStatus;
}
export interface MinecraftTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(command: string): Promise<string>;
  isConnected(): boolean;
}
export interface OverlayService {
  show(text: string, duration: number, details?: AlertDetails): Promise<void>;
}
export interface AudioService {
  play(file: string, volume: number, signal?: AbortSignal, impact?: Impact): Promise<void>;
}
