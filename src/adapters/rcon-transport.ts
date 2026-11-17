import { Rcon } from 'rcon-client';
import type { MinecraftTransport } from './contracts';

export class RCONTransport implements MinecraftTransport {
  private client?: Rcon;
  private connected = false;
  constructor(
    private readonly config: { host: string; port: number; password: string },
    private readonly onError: (error: unknown) => void,
  ) {}
  async connect(): Promise<void> {
    if (!['127.0.0.1', 'localhost', '::1'].includes(this.config.host))
      throw new Error('El MVP sólo permite RCON local');
    await this.disconnect();
    const client = new Rcon({ ...this.config, timeout: 5000, maxPending: 1 });
    // rcon-client sets this to maxPending (1); our persistent end observer adds one.
    client.emitter.setMaxListeners(4);
    client.on('error', (error) => {
      this.connected = false;
      this.onError(error);
    });
    client.on('end', () => {
      this.connected = false;
    });
    this.client = client;
    try {
      await client.connect();
      this.connected = true;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }
  async disconnect(): Promise<void> {
    this.connected = false;
    const client = this.client;
    this.client = undefined;
    client?.socket?.destroy();
  }
  async send(command: string): Promise<string> {
    if (!this.client || !this.connected) throw new Error('Minecraft desconectado');
    if (!command.trim() || /[\r\n\0]/.test(command)) throw new Error('Comando inválido');
    // Never retry a send: a timeout may have occurred AFTER Minecraft executed it.
    try {
      return await this.client.send(command.replace(/^\//, ''));
    } catch (error) {
      // Discard timed-out clients: do not retain callbacks or resend an ambiguous command.
      await this.disconnect();
      throw error;
    }
  }
  isConnected(): boolean {
    return this.connected;
  }
}
