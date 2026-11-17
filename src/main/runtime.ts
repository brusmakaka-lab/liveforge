import { clipboard, dialog, shell } from 'electron';
import { Repository } from '../storage/repository';
import { starterData } from '../shared/defaults';
import { requestSchema, type MediaMessage, type Reply, type Request } from '../shared/api';
import type { Rule, Settings, Snapshot } from '../shared/model';
import { Logger, errorMessage } from '../core/logging';
import { ActionQueue } from '../core/queue';
import { RulesEngine } from '../core/rules-engine';
import { EventBus } from '../core/events';
import { alertDetails } from '../shared/media';
import { renderTemplate, seededRandom } from '../core/templates';
import { registerActionHandlers } from '../core/action-handlers';
import { MinecraftAdapter } from '../adapters/minecraft';
import { RCONTransport } from '../adapters/rcon-transport';
import { TikTokProvider } from '../providers/tiktok';
import { simulatedEvent, testRule } from '../providers/simulator';
import { SecretStore } from './secrets';
import { DesktopMedia } from './media';
import { importAlertImage } from './custom-image';
import { ServerHub } from './server-hub';
import { inspectServer, serverLaunch, serverLocation } from './server-paths';
import { join } from 'node:path';
import { PerformanceGuard } from '../core/performance-guard';
import { defaultPerformance } from '../shared/performance';
import { defaultStudio, type PublicOverlay } from '../shared/overlay-studio';
import { GiftMetadataCache, hudFromRules } from '../core/hud';
import { OverlayHttp } from './overlay-http';
import { bedrockPreset } from '../shared/bedrock-preset';

export class Runtime {
  readonly log: Logger;
  readonly queue: ActionQueue;
  readonly engine: RulesEngine;
  readonly bus: EventBus;
  readonly server: ServerHub;
  readonly performance: PerformanceGuard;
  readonly overlayHttp: OverlayHttp;
  private readonly gifts = new GiftMetadataCache();
  private readonly performanceTimer: ReturnType<typeof setInterval>;
  private settings: Settings;
  private rules: Rule[];
  private game: MinecraftAdapter;
  private live: TikTokProvider;
  private secrets: SecretStore;
  private media: DesktopMedia;
  private maintenance: ReturnType<typeof setInterval>;
  private gameBusy = false;
  private liveBusy = false;
  private settingsBusy = false;
  private random: () => number;
  private rawEvents: unknown[] = [];
  constructor(
    private readonly repository: Repository,
    sendMedia: (message: MediaMessage) => void,
    private readonly configureOverlay: (settings: NonNullable<Settings['overlay']>) => void = () => undefined,
  ) {
    if (!repository.presets().length) {
      const data = starterData();
      repository.transaction(() => {
        repository.savePreset(data.preset);
        data.rules.forEach((r) => repository.saveRule(r));
        data.commands.forEach((c) => repository.saveCommand(c));
      });
    }
    this.settings = repository.settings();
    this.rules = repository.rules();
    if (!repository.presets().some((p) => p.id === this.settings.activePresetId)) {
      this.settings.activePresetId = repository.presets()[0]!.id;
      repository.saveSettings(this.settings);
    }
    this.secrets = new SecretStore(repository);
    this.log = new Logger((entry) => {
      if (entry.level !== 'DEBUG') repository.appendLog(entry);
    });
    this.log.entries.push(...repository.logs());
    this.server = new ServerHub((message) => this.log.write('ERROR', 'SYSTEM', `Server Hub: ${message}`));
    this.random = this.settings.developer.randomSeed
      ? seededRandom(this.settings.developer.randomSeed)
      : Math.random;
    this.performance = new PerformanceGuard(
      () => this.settings.performanceProtection ?? defaultPerformance(),
      this.log,
      (ledger) => {
        const next = { ...this.settings, performanceLedger: ledger };
        repository.saveSettings(next);
        this.settings = next;
      },
      this.settings.performanceLedger,
    );
    this.queue = new ActionQueue(this.log, 500, () => this.random(), this.performance);
    this.queue.pause();
    this.engine = new RulesEngine(
      this.queue,
      () => this.rules.filter((r) => r.presetId === this.settings.activePresetId),
      () => this.settings.player,
      this.log,
      Date.now,
      {
        progress: (rule, event) =>
          this.media.progress(rule, event, this.settings.player, this.engine.session.totalLikes),
        stop: () => this.media?.stop(),
      },
      () => this.settings.performanceProtection ?? defaultPerformance(),
    );
    this.bus = new EventBus((error) => this.log.write('ERROR', 'SYSTEM', errorMessage(error)));
    this.bus.subscribe((event) => {
      this.gifts.observe(event);
      const summary =
        event.type === 'GIFT'
          ? `${event.payload.giftName} ×${event.payload.repeatCount}${event.payload.streak && !event.payload.repeatEnd ? ' · racha en progreso' : ''}`
          : event.type === 'LIKE'
            ? `+${event.payload.likeCount} likes · total ${event.payload.totalLikeCount ?? '—'}`
            : event.type === 'CHAT'
              ? event.payload.message
              : event.type;
      this.log.write(
        'INFO',
        'LIVE',
        `${event.source === 'simulator' ? '[SIM] ' : ''}@${event.user.username} · ${summary}`,
        { eventId: event.id },
      );
      if (event.raw) {
        this.rawEvents.push(event.raw);
        if (this.rawEvents.length > 20) this.rawEvents.shift();
      }
      this.engine.process(event);
    });
    this.game = new MinecraftAdapter(
      new RCONTransport({ ...this.settings.minecraft, password: '' }, (e) =>
        this.log.write('ERROR', 'MINECRAFT', errorMessage(e)),
      ),
      this.log,
    );
    this.media = new DesktopMedia(
      sendMedia,
      () => this.settings.audio,
      (message) => this.log.write('WARN', 'AUDIO', message),
    );
    registerActionHandlers(this.queue, {
      game: () => this.game,
      audio: this.media,
      overlay: this.media,
      log: this.log,
    });
    this.live = new TikTokProvider((event) => this.bus.publish(event), this.log, {
      retainRaw: () => this.settings.developer.retainRaw,
      signKey: async () => {
        const key = await this.secrets.get('signKey');
        if (key) this.log.protect(key);
        return key;
      },
      onEnded: () => {
        this.engine.endSession();
        this.engine.stop();
      },
    });
    repository.pruneLogs(this.settings.logRetentionDays);
    this.maintenance = setInterval(() => {
      try {
        repository.pruneLogs(this.settings.logRetentionDays);
      } catch (error) {
        this.log.write('ERROR', 'SYSTEM', `Retención: ${errorMessage(error)}`);
      }
    }, 60_000);
    this.log.write('INFO', 'SYSTEM', 'LiveForge listo · DRY RUN activo · eventos detenidos');
    this.overlayHttp = new OverlayHttp(
      join(import.meta.dirname, '../overlay'),
      () => this.publicOverlay(),
      (message) => this.log.write('WARN', 'SYSTEM', message),
    );
    void this.overlayHttp.configure(this.settings.overlayStudio ?? defaultStudio());
    this.performanceTimer = setInterval(() => {
      try {
        this.performance.tick();
      } catch (error) {
        this.log.write('ERROR', 'QUEUE', `Reservas: ${errorMessage(error)}`);
      }
    }, 1000);
  }
  get alerts() {
    return this.media.alerts.snapshot;
  }
  snapshot(): Snapshot {
    return {
      performance: this.performance.snapshot,
      overlayHttp: this.overlayHttp?.snapshot,
      publicOverlay: this.publicOverlay(),
      settings: this.settings,
      hasPassword: Boolean(this.repository.secret('rconPassword')),
      hasSignKey: Boolean(this.repository.secret('signKey')),
      presets: this.repository.presets(),
      rules: this.rules,
      commands: this.repository.commands(),
      session: this.engine.session,
      live: this.live.getStatus(),
      game: this.game.getStatus(),
      eventsEnabled: this.engine.enabled,
      dryRun: this.queue.dryRun,
      queuePaused: this.queue.paused,
      jobs: this.queue.snapshot,
      cooldowns: this.engine.cooldowns,
      logs: this.log.entries,
      executed: this.queue.completed,
      errors: this.log.errors,
    };
  }
  async request(input: unknown): Promise<Reply> {
    try {
      const request = requestSchema.parse(input);
      if (request.op === 'serverStatus') return { ok: true, server: this.server.snapshot() };
      if (request.op === 'serverInspect') return { ok: true, inspection: await inspectServer(request.root) };
      if (request.op === 'chooseAlertImage') {
        const result = await dialog.showOpenDialog({
          title: 'Elegir imagen personalizada de alerta',
          properties: ['openFile'],
          filters: [{ name: 'Imagen', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        });
        return {
          ok: true,
          image: result.filePaths[0] ? await importAlertImage(result.filePaths[0]) : undefined,
        };
      }
      const text = await this.dispatch(request);
      return { ok: true, text, snapshot: request.op === 'snapshot' ? this.snapshot() : undefined };
    } catch (error) {
      const message = errorMessage(error);
      this.log.write('ERROR', 'SYSTEM', message);
      return { ok: false, error: message };
    }
  }
  private async dispatch(request: Request): Promise<string | undefined> {
    const repo = this.repository;
    switch (request.op) {
      case 'saveStudio':
        this.settings = { ...this.settings, overlayStudio: request.settings };
        repo.saveSettings(this.settings);
        await this.overlayHttp.configure(request.settings);
        return this.overlayHttp.snapshot.error ?? 'Overlay Studio guardado';
      case 'savePerformance':
        this.settings = { ...this.settings, performanceProtection: request.settings };
        repo.saveSettings(this.settings);
        this.log.write(
          'WARN',
          'QUEUE',
          `Protección de carga estimada ${request.settings.enabled ? 'activada' : 'desactivada'}; no mide ni elimina efectos reales`,
        );
        if (!this.queue.paused) this.queue.resume();
        return 'Protección guardada';
      case 'createBedrockPreset': {
        const data = bedrockPreset(repo.commands());
        repo.transaction(() => {
          repo.savePreset(data.preset);
          data.rules.forEach((r) => repo.saveRule(r));
        });
        this.rules = repo.rules();
        return 'Bedrock Interactive v1 creado. Actívalo desde Presets y configura la protección estimada en Overlay Studio.';
      }
      case 'copyOverlayUrl':
      case 'openOverlayPreview': {
        const status = this.overlayHttp.snapshot;
        if (status.state !== 'ONLINE') throw new Error('Activa primero el servidor de overlay');
        const url = `http://127.0.0.1:${status.port}/overlay/${request.view}`;
        if (request.op === 'copyOverlayUrl') clipboard.writeText(url);
        else await shell.openExternal(url);
        return url;
      }
      case 'serverStatus':
      case 'serverInspect':
        return;
      case 'chooseServerRoot': {
        const result = await dialog.showOpenDialog({
          title: 'Carpeta raíz del servidor',
          properties: ['openDirectory'],
        });
        return result.filePaths[0];
      }
      case 'serverSave': {
        if (this.server.active)
          throw new Error('Detén el servidor administrado antes de cambiar su configuración');
        const inspected = await inspectServer(request.config.root);
        const config = { ...request.config, root: inspected.root };
        await serverLaunch(config);
        if (this.server.active)
          throw new Error(
            'El servidor se inició mientras se validaba la configuración; deténlo antes de guardar',
          );
        this.settings = { ...this.settings, localServer: config };
        repo.saveSettings(this.settings);
        return 'Configuración del servidor guardada';
      }
      case 'serverStart':
      case 'serverRestart':
      case 'serverStop': {
        const config = this.settings.localServer;
        if (!config) throw new Error('Configura y guarda primero el servidor local');
        if (request.op === 'serverStart') await this.server.start(config);
        else if (request.op === 'serverStop') await this.server.stop(config.stopTimeout);
        else await this.server.restart(config);
        return;
      }
      case 'serverCommand':
        await this.server.command(request.command);
        return;
      case 'serverOpen': {
        if (!this.settings.localServer) throw new Error('Configura el servidor local');
        const path = await serverLocation(this.settings.localServer.root, request.location);
        if (request.location === 'server.properties') shell.showItemInFolder(path);
        else {
          const error = await shell.openPath(path);
          if (error) throw new Error(error);
        }
        return;
      }
      case 'overlay':
        this.settings = {
          ...this.settings,
          overlay: { visible: request.visible, locked: request.locked, x: request.x, y: request.y },
        };
        repo.saveSettings(this.settings);
        this.configureOverlay(this.settings.overlay!);
        return;
      case 'mediaReady':
        return;
      case 'previewAlert': {
        if (request.action.type !== 'ShowAlert') throw new Error('La vista previa requiere ShowAlert');
        const event = simulatedEvent(request.event);
        const details = alertDetails(event, 'preview', request.action.id, request.impact);
        details.icon = request.action.icon;
        details.customImage = request.action.customImage;
        if (request.action.showGiftImage === false) details.image = undefined;
        await this.media.show(
          renderTemplate(
            request.action.text,
            {
              player: this.settings.player,
              username: event.user.username,
              nickname: event.user.nickname,
              giftName: details.giftName,
              giftCount: details.quantity,
              likeCount: 0,
              totalLikes: this.engine.session.totalLikes,
            },
            'text',
          ),
          request.action.duration,
          details,
        );
        return;
      }
      case 'previewSound':
        await this.media.play(request.file, request.volume);
        return;
      case 'stopSound':
        this.media.sounds.stop();
        return;
      case 'snapshot':
        return;
      case 'startEvents':
        this.engine.resume();
        return;
      case 'stopEvents':
        this.engine.stop();
        this.media.stop();
        return;
      case 'pauseQueue':
        this.queue.pause();
        return;
      case 'resumeQueue':
        if (!this.engine.enabled) throw new Error('Pulsa START EVENTS para salir de STOP');
        this.queue.resume();
        return;
      case 'clearQueue':
        this.queue.clear();
        return;
      case 'dryRun':
        this.queue.dryRun = request.value;
        this.log.write(
          'WARN',
          'SYSTEM',
          `DRY RUN ${request.value ? 'activado' : 'desactivado: los comandos se enviarán a Minecraft'}`,
        );
        return;
      case 'resetSession':
        this.engine.resetCounters();
        return;
      case 'saveSettings': {
        if (this.settingsBusy || this.gameBusy || this.liveBusy)
          throw new Error('Espera a que termine la operación de conexión/configuración');
        this.settingsBusy = true;
        try {
          if (request.password !== undefined && request.password !== '') {
            this.log.protect(request.password);
            await this.secrets.set('rconPassword', request.password);
          }
          if (request.signKey !== undefined && request.signKey !== '') {
            this.log.protect(request.signKey);
            await this.secrets.set('signKey', request.signKey);
          }
          const changedGame =
            JSON.stringify(request.settings.minecraft) !== JSON.stringify(this.settings.minecraft) ||
            Boolean(request.password);
          const changedLive =
            request.settings.tiktokUsername !== this.settings.tiktokUsername || Boolean(request.signKey);
          const nextSettings = {
            ...request.settings,
            overlay: this.settings.overlay,
            activePresetId: this.settings.activePresetId,
            localServer: this.settings.localServer,
            performanceLedger: this.settings.performanceLedger,
            performanceProtection: this.settings.performanceProtection,
            overlayStudio: this.settings.overlayStudio,
          };
          repo.saveSettings(nextSettings);
          this.settings = nextSettings;
          this.random = this.settings.developer.randomSeed
            ? seededRandom(this.settings.developer.randomSeed)
            : Math.random;
          if (!this.settings.developer.retainRaw) this.rawEvents = [];
          if (changedGame || changedLive) this.engine.stop();
          if (changedGame) await this.game.disconnect();
          if (changedLive) {
            await this.live.disconnect();
            this.engine.endSession();
          }
          this.media.stop();
          this.log.write('INFO', 'SYSTEM', 'Configuración guardada');
          return;
        } finally {
          this.settingsBusy = false;
        }
      }
      case 'connectLive':
        if (this.liveBusy || this.settingsBusy) throw new Error('TikTok está procesando una conexión');
        this.liveBusy = true;
        try {
          this.engine.stop();
          this.engine.startSession('tiktok');
          await this.live.connect(this.settings.tiktokUsername);
        } finally {
          this.liveBusy = false;
        }
        return;
      case 'disconnectLive':
        await this.live.disconnect();
        this.engine.endSession();
        this.engine.stop();
        return;
      case 'connectGame':
      case 'testGame': {
        if (this.gameBusy || this.settingsBusy) throw new Error('Minecraft está procesando una conexión');
        this.gameBusy = true;
        try {
          if (this.game.getStatus().state !== 'CONNECTED') {
            const password = await this.secrets.get('rconPassword');
            if (!password) throw new Error('Guarda la contraseña RCON en Settings');
            this.log.protect(password);
            await this.game.disconnect();
            this.game = new MinecraftAdapter(
              new RCONTransport({ ...this.settings.minecraft, password }, (error) =>
                this.log.write('ERROR', 'MINECRAFT', errorMessage(error)),
              ),
              this.log,
            );
            await this.game.connect();
          }
          const result = await this.game.testConnection();
          return `RCON OK · ${result.latency} ms · ${result.response}`;
        } finally {
          this.gameBusy = false;
        }
      }
      case 'disconnectGame':
        if (this.gameBusy) throw new Error('Espera a que termine la conexión');
        await this.game.disconnect();
        return;
      case 'savePreset':
        repo.savePreset(request.preset);
        return;
      case 'duplicatePreset':
        repo.duplicatePreset(request.id);
        this.rules = repo.rules();
        return;
      case 'deletePreset':
        if (request.id === this.settings.activePresetId)
          throw new Error('Activa otro preset antes de eliminar éste');
        repo.deletePreset(request.id);
        this.rules = repo.rules();
        return;
      case 'activatePreset':
        if (!repo.presets().some((p) => p.id === request.id)) throw new Error('Preset inexistente');
        this.engine.stop();
        this.settings.activePresetId = request.id;
        repo.saveSettings(this.settings);
        this.log.write('INFO', 'SYSTEM', 'Preset activado; pulsa START EVENTS');
        return;
      case 'saveRule':
        repo.saveRule({ ...request.rule, updatedAt: Date.now() });
        this.rules = repo.rules();
        return;
      case 'deleteRule':
        this.queue.clear(request.id);
        repo.deleteRule(request.id);
        this.engine.forgetRule(request.id);
        this.rules = repo.rules();
        return;
      case 'testRule': {
        if (!this.engine.enabled)
          throw new Error('Pulsa START EVENTS antes de TEST. STOP también bloquea pruebas manuales.');
        const rule = this.rules.find(
          (r) => r.id === request.id && r.presetId === this.settings.activePresetId,
        );
        if (!rule) throw new Error('Guarda la regla y activa su preset antes de TEST');
        if (rule.availability && rule.availability !== 'READY')
          throw new Error(
            'Regla FUTURE / sin configurar: agrega comandos validados y cambia disponibilidad a READY',
          );
        testRule(this.bus, rule);
        return 'TEST enviado al motor';
      }
      case 'simulate':
        this.bus.publish(simulatedEvent(request.event));
        return 'Evento simulado publicado';
      case 'saveCommand':
        repo.saveCommand(request.command);
        return;
      case 'deleteCommand':
        repo.deleteCommand(request.id);
        return;
      case 'chooseSound': {
        const result = await dialog.showOpenDialog({
          title: 'Elegir sonido',
          properties: ['openFile'],
          filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
        });
        return result.filePaths[0];
      }
      case 'audioResult':
        this.media.result(request.id, request.error, request.phase);
        return;
      case 'copyDiagnostics': {
        const s = this.snapshot();
        clipboard.writeText(
          JSON.stringify(
            {
              app: 'LiveForge 0.2.0',
              versions: process.versions,
              state: {
                live: s.live,
                game: s.game,
                session: s.session,
                eventsEnabled: s.eventsEnabled,
                dryRun: s.dryRun,
                queuePaused: s.queuePaused,
                queueSize: this.queue.pendingCount,
              },
              settings: s.settings,
              logs: s.logs,
              rawEvents: this.rawEvents,
            },
            null,
            2,
          ),
        );
        return 'Diagnóstico copiado; contiene usernames y comandos, sin secretos';
      }
    }
  }
  async shutdown(): Promise<void> {
    if (this.server.active) throw new Error('Detén primero el servidor local antes de cerrar LiveForge');
    clearInterval(this.maintenance);
    clearInterval(this.performanceTimer);
    await this.overlayHttp.dispose();
    this.engine.stop();
    this.media.stop();
    await this.live.disconnect();
    await this.game.disconnect();
    this.media.dispose();
    this.repository.close();
  }
  private publicOverlay(): PublicOverlay {
    return {
      layout: this.settings.overlayStudio ?? defaultStudio(),
      items: hudFromRules(
        this.rules,
        this.settings.activePresetId,
        this.gifts,
        this.settings.performanceProtection,
      ),
      alerts: (this.media?.alerts.snapshot ?? []).map((a) => ({
        id: a.id,
        username: a.username,
        giftName: a.giftName,
        quantity: a.quantity,
        impact: a.impact,
        text: a.text,
        image: a.image,
        customImage: a.customImage,
        icon: a.icon,
        activeStreak: a.activeStreak,
        expiresAt: a.expiresAt,
        leaving: a.leaving,
      })),
    };
  }
}
