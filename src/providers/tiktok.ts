import { ControlEvent, SignConfig, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import type { ConnectionStatus, EventType } from '../shared/model';
import type { LiveProvider, LiveEventSink } from './contracts';
import { TikTokNormalizer } from './tiktok-normalizer';
import { Logger } from '../core/logging';
import { tiktokErrorDetails, tiktokErrorMessage } from './tiktok-errors';

export class TikTokProvider implements LiveProvider {
  private connection?: TikTokLiveConnection;
  private status: ConnectionStatus = { state: 'DISCONNECTED' };
  private desired = false;
  private generation = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private username = '';
  private normalizer = new TikTokNormalizer();
  constructor(
    private readonly sink: LiveEventSink,
    private readonly log: Logger,
    private readonly options: {
      retainRaw: () => boolean;
      signKey: () => Promise<string | undefined>;
      onEnded: () => void;
    },
  ) {}
  getStatus(): ConnectionStatus {
    return this.status;
  }
  async connect(username: string): Promise<void> {
    const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase();
    if (!/^[\w.]{1,100}$/.test(normalizedUsername)) throw new Error('Configura un usuario TikTok válido');
    await this.disconnect();
    // api-live/user/room is case-sensitive even though public profile URLs are not.
    this.username = normalizedUsername;
    this.desired = true;
    this.attempts = 0;
    this.status = { state: 'CONNECTING' };
    await this.attempt(this.generation);
  }
  async disconnect(): Promise<void> {
    this.desired = false;
    this.generation++;
    if (this.retry) clearTimeout(this.retry);
    const previous = this.connection;
    this.connection = undefined;
    if (previous) {
      try {
        await previous.disconnect();
      } catch (error) {
        this.log.write('WARN', 'LIVE', `Desconexión TikTok: ${tiktokErrorMessage(error)}`, {
          error: tiktokErrorDetails(error),
        });
      }
    }
    this.status = { state: 'DISCONNECTED' };
  }
  private async attempt(generation: number): Promise<void> {
    if (!this.desired || generation !== this.generation) return;
    const attemptStarted = Date.now();
    try {
      const signApiKey = await this.options.signKey();
      if (!this.desired || generation !== this.generation) return;
      const previous = this.connection;
      this.connection = undefined;
      if (previous) await previous.disconnect();
      // The library caches the signing client globally; recreate it for key rotation.
      SignConfig.apiKey = signApiKey;
      SignConfig.baseOptions = { ...SignConfig.baseOptions, timeout: 15_000 };
      SignConfig.cachedInstance = undefined;
      const connection = new TikTokLiveConnection(this.username, {
        processInitialData: false,
        // The optional gift catalog invokes Euler's Business URL-signing endpoint.
        // Live gift messages already carry the fields consumed by our normalizer.
        enableExtendedGiftInfo: false,
        signApiKey,
        wsClientOptions: { handshakeTimeout: 15_000 },
      });
      this.connection = connection;
      const current = (): boolean =>
        generation === this.generation && this.desired && this.connection === connection;
      const accept = (type: EventType, data: unknown): void => {
        if (!current()) return;
        try {
          const event = this.normalizer.normalize(type, data, this.options.retainRaw());
          if (event.timestamp < attemptStarted - 2000) {
            this.log.write('DEBUG', 'LIVE', 'Historial antiguo descartado');
            return;
          }
          this.sink(event);
        } catch (error) {
          this.log.write('ERROR', 'LIVE', `Evento TikTok inválido: ${tiktokErrorMessage(error)}`, {
            type,
            error: tiktokErrorDetails(error),
          });
        }
      };
      connection.on(WebcastEvent.GIFT, (data) => accept('GIFT', data));
      connection.on(WebcastEvent.LIKE, (data) => accept('LIKE', data));
      connection.on(WebcastEvent.FOLLOW, (data) => accept('FOLLOW', data));
      connection.on(WebcastEvent.SHARE, (data) => accept('SHARE', data));
      connection.on(WebcastEvent.CHAT, (data) => accept('CHAT', data));
      connection.on(WebcastEvent.MEMBER, (data) => accept('MEMBER_JOIN', data));
      connection.on(WebcastEvent.SUB_NOTIFY, (data) => {
        if (data.subscribingStatus === 1 || data.subscribingStatus === 2) accept('SUBSCRIBE', data);
      });
      connection.on(WebcastEvent.STREAM_END, () => {
        if (current()) {
          this.desired = false;
          this.status = { state: 'DISCONNECTED', detail: 'LIVE finalizado' };
          this.log.write('INFO', 'LIVE', 'LIVE finalizado');
          this.options.onEnded();
        }
      });
      connection.on(ControlEvent.ERROR, (error) => {
        if (current())
          this.log.write('ERROR', 'LIVE', `TikTok: ${tiktokErrorMessage(error)}`, {
            username: this.username,
            error: tiktokErrorDetails(error),
          });
      });
      connection.on(ControlEvent.DISCONNECTED, () => {
        if (current()) this.schedule(generation, 'Conexión interrumpida');
      });
      await connection.connect();
      if (!current()) {
        await connection.disconnect();
        return;
      }
      this.attempts = 0;
      this.status = { state: 'CONNECTED', detail: `@${this.username}` };
      this.log.write('INFO', 'LIVE', `TikTok conectado: @${this.username}`);
    } catch (error) {
      if (this.desired && generation === this.generation)
        this.schedule(generation, tiktokErrorMessage(error), tiktokErrorDetails(error));
    }
  }
  private schedule(generation: number, detail: string, error?: Record<string, unknown>): void {
    if (this.retry) clearTimeout(this.retry);
    const delay = Math.min(60_000, 2000 * 2 ** Math.min(this.attempts++, 5));
    this.status = { state: 'RECONNECTING', detail: `${detail} · reintento en ${delay / 1000}s` };
    this.log.write('WARN', 'LIVE', this.status.detail!, {
      username: this.username,
      attempt: this.attempts,
      retryDelayMs: delay,
      error,
    });
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.attempt(generation);
    }, delay);
  }
}
