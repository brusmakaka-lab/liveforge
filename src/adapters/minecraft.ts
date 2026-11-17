import type { GameAdapter, MinecraftTransport } from './contracts';
import type { ConnectionStatus } from '../shared/model';
import { Logger, errorMessage } from '../core/logging';

export class MinecraftAdapter implements GameAdapter<{ type: 'command'; command: string }> {
  private status: ConnectionStatus = { state: 'DISCONNECTED' };
  constructor(
    private readonly transport: MinecraftTransport,
    private readonly log: Logger,
  ) {}
  async connect(): Promise<void> {
    this.status = { state: 'CONNECTING' };
    try {
      await this.transport.connect();
      this.status = { state: 'CONNECTED' };
      this.log.write('INFO', 'MINECRAFT', 'Minecraft conectado por RCON');
    } catch (error) {
      this.status = { state: 'ERROR', detail: errorMessage(error) };
      throw error;
    }
  }
  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.status = { state: 'DISCONNECTED' };
  }
  async execute(action: { type: 'command'; command: string }): Promise<string> {
    try {
      this.log.write('INFO', 'MINECRAFT', `Comando → ${action.command}`);
      const result = await this.transport.send(action.command);
      this.log.write('INFO', 'MINECRAFT', `Respuesta ← ${result || '(vacía)'}`);
      return result;
    } catch (error) {
      this.status = {
        state: this.transport.isConnected() ? 'CONNECTED' : 'ERROR',
        detail: errorMessage(error),
      };
      throw error;
    }
  }
  async testConnection(): Promise<{ response: string; latency: number }> {
    if (!this.transport.isConnected()) await this.connect();
    const started = performance.now();
    const response = await this.execute({ type: 'command', command: 'list' });
    const latency = Math.round(performance.now() - started);
    this.status = { state: 'CONNECTED', latency };
    return { response, latency };
  }
  getStatus(): ConnectionStatus {
    if (this.status.state === 'CONNECTED' && !this.transport.isConnected())
      return { state: 'DISCONNECTED', detail: 'Conexión RCON cerrada' };
    return this.status;
  }
}
