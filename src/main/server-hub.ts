import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { serverLaunch } from './server-paths';
import type { ServerConfig, ServerLine, ServerSnapshot } from '../shared/server';
import { errorMessage } from '../core/logging';
import { stripVTControlCharacters } from 'node:util';

type Launch = Awaited<ReturnType<typeof serverLaunch>>;
/** Owns only its child and pipes. No RCON, process discovery, adoption, or forced kill. */
export class ServerHub {
  private child?: ChildProcessWithoutNullStreams;
  private state: ServerSnapshot['state'] = 'OFFLINE';
  private busy = false;
  private error?: string;
  private startedAt?: number;
  private exitCode?: number | null;
  private lines: ServerLine[] = [];
  private serial = 0;
  private stopped = Promise.resolve();
  private stopRequested = false;
  private scriptInput = false;
  constructor(
    private readonly report: (message: string) => void,
    private readonly launch: (config: ServerConfig) => Promise<Launch> = serverLaunch,
  ) {}
  get active(): boolean {
    return Boolean(this.child) || this.busy;
  }
  snapshot(): ServerSnapshot {
    return {
      state: this.state,
      active: this.active,
      busy: this.busy,
      pid: this.child?.pid,
      startedAt: this.child ? this.startedAt : undefined,
      error: this.error,
      exitCode: this.exitCode,
      logs: this.lines,
    };
  }
  private line(text: string, stderr = false): void {
    const clean = stripVTControlCharacters(text).slice(0, 4096);
    if (!clean.trim()) return;
    const level = /\b(ERROR|FATAL|Exception)\b/i.test(clean)
      ? 'ERROR'
      : stderr || /\bWARN\b/i.test(clean)
        ? 'WARN'
        : 'INFO';
    this.lines.push({ id: ++this.serial, time: Date.now(), text: clean, level });
    if (this.lines.length > 500) this.lines.splice(0, this.lines.length - 500);
    if (!stderr && this.state === 'STARTING' && /Done \([^)]+\)!/.test(clean)) this.state = 'ONLINE';
  }
  private fail(error: unknown): void {
    this.error = errorMessage(error);
    this.state = 'ERROR';
    this.line(this.error, true);
    this.report(this.error);
  }
  async start(config: ServerConfig): Promise<void> {
    if (this.active) throw new Error('El servidor administrado ya está activo u ocupado');
    this.busy = true;
    try {
      await this.startProcess(config);
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }
  private async startProcess(config: ServerConfig): Promise<void> {
    const launch = await this.launch(config);
    this.state = 'STARTING';
    this.error = undefined;
    this.exitCode = undefined;
    this.stopRequested = false;
    this.scriptInput = launch.windowsVerbatimArguments === true;
    this.line(`Iniciando ${config.entry} en ${config.root}`);
    const child = spawn(launch.file, launch.args, {
      cwd: launch.cwd,
      stdio: 'pipe',
      windowsHide: true,
      shell: false,
      windowsVerbatimArguments: launch.windowsVerbatimArguments,
    });
    this.child = child;
    this.startedAt = Date.now();
    let finish!: () => void;
    this.stopped = new Promise<void>((resolve) => {
      finish = resolve;
    });
    for (const [stream, stderr] of [
      [child.stdout, false],
      [child.stderr, true],
    ] as const) {
      let pending = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        pending += chunk;
        const parts = pending.split(/\r?\n|\r/g);
        pending = parts.pop() ?? '';
        for (const part of parts) this.line(part, stderr);
        if (pending.length > 4096) {
          this.line(pending, stderr);
          pending = '';
        }
      });
      stream.on('end', () => {
        this.line(pending, stderr);
      });
      stream.on('error', (error) => this.fail(error));
    }
    child.stdin.on('error', (error) => this.fail(error));
    child.once('error', (error) => {
      this.fail(error);
    });
    child.once('close', (code) => {
      this.exitCode = code;
      this.child = undefined;
      if (code === 0 && this.stopRequested) {
        this.state = 'OFFLINE';
        this.error = undefined;
      } else
        this.fail(
          new Error(
            `El proceso terminó con código ${code}. Revisa consola; los scripts deben mantener Java en primer plano y no usar start.`,
          ),
        );
      this.line(`Proceso cerrado (${code})`);
      finish();
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  }
  async command(command: string): Promise<void> {
    const child = this.child;
    if (!child || !child.stdin.writable || child.exitCode !== null)
      throw new Error('No hay consola de un proceso administrado activo');
    if (!command.trim() || command.length > 4096 || /[\r\n\0]/.test(command))
      throw new Error('El comando debe ocupar una sola línea');
    if (this.state !== 'ONLINE' && command.trim().toLowerCase() !== 'stop')
      throw new Error('Espera a ONLINE antes de enviar comandos');
    if (command.trim().toLowerCase() === 'stop') {
      this.stopRequested = true;
      this.state = 'STOPPING';
    }
    await new Promise<void>((resolve, reject) =>
      child.stdin.write(`${command}\n`, (error) => (error ? reject(error) : resolve())),
    );
    // A foreground .bat/.cmd may end in pause after Java exits. EOF releases that
    // prompt without a second command; completion still requires the real close event.
    if (command.trim().toLowerCase() === 'stop' && this.scriptInput) child.stdin.end();
    this.line(`> ${command}`);
  }
  private async stopProcess(seconds: number): Promise<void> {
    if (!this.child) return;
    this.state = 'STOPPING';
    // After a timeout, a script already received stop + EOF. Keep waiting for its
    // original process instead of writing again to the closed input pipe.
    if (!(this.stopRequested && this.scriptInput && this.child.stdin.writableEnded))
      await this.command('stop');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.stopped,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  'El proceso administrado no confirmó su cierre; puede seguir activo el servidor o su script. No se forzó Java. Revisa la consola y vuelve a detenerlo.',
                ),
              ),
            seconds * 1000,
          );
        }),
      ]);
      if (this.snapshot().state === 'ERROR') throw new Error(this.error);
    } finally {
      clearTimeout(timer);
    }
  }
  async stop(seconds: number): Promise<void> {
    if (this.busy) throw new Error('Espera a que termine la operación del servidor');
    this.busy = true;
    try {
      await this.stopProcess(seconds);
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async restart(config: ServerConfig): Promise<void> {
    if (this.busy) throw new Error('Espera a que termine la operación del servidor');
    this.busy = true;
    try {
      await this.stopProcess(config.stopTimeout);
      await this.startProcess(config);
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
