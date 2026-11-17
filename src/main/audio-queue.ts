import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { MediaMessage } from '../shared/api';
import { impactRank, type Impact } from '../shared/media';
import type { Settings } from '../shared/model';
import { errorMessage } from '../core/logging';

type Sound = {
  id: string;
  file: string;
  volume: number;
  impact: Impact;
  created: number;
  signal?: AbortSignal;
};
export class AudioQueue {
  private waiting: Sound[] = [];
  private current?: Sound;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  constructor(
    private readonly send: (message: MediaMessage) => void,
    private readonly settings: () => Settings['audio'],
    private readonly warn: (message: string) => void,
    private readonly now = Date.now,
  ) {}
  get pendingCount(): number {
    return this.waiting.length;
  }
  async play(file: string, volume: number, signal?: AbortSignal, impact: Impact = 'NORMAL'): Promise<void> {
    signal?.throwIfAborted();
    if (!file || this.settings().mute || this.settings().volume === 0) return;
    if (!['.mp3', '.wav', '.ogg'].includes(extname(file).toLowerCase()))
      throw new Error('Selecciona MP3, WAV u OGG');
    const sound: Sound = { id: randomUUID(), file, volume, signal, impact, created: this.now() };
    if (this.waiting.length >= 20) {
      const weakest = this.waiting.reduce((a, b) => (impactRank[a.impact] <= impactRank[b.impact] ? a : b));
      this.warn('Audio: límite de 20 pendientes; se descarta el sonido de menor prioridad');
      if (impactRank[weakest.impact] >= impactRank[impact]) return;
      this.waiting = this.waiting.filter((item) => item !== weakest);
    }
    this.waiting.push(sound);
    void this.pump();
  }
  private async pump(): Promise<void> {
    if (this.current) return;
    this.waiting.sort((a, b) => impactRank[b.impact] - impactRank[a.impact] || a.created - b.created);
    const sound = this.waiting.shift();
    if (!sound) return;
    if (sound.signal?.aborted || this.now() - sound.created > 15_000 || this.settings().mute) {
      this.warn('Audio pendiente descartado: cancelado, silenciado o más de 15 segundos de antigüedad');
      void this.pump();
      return;
    }
    this.current = sound;
    const generation = this.generation;
    try {
      const info = await stat(sound.file);
      if (!info.isFile() || info.size > 20 * 1024 * 1024)
        throw new Error('El audio debe ser un archivo de menos de 20 MB');
      const data = await readFile(sound.file);
      if (generation !== this.generation) return;
      if (sound.signal?.aborted) {
        this.finish();
        return;
      }
      const mime: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
      this.send({
        type: 'audio',
        id: sound.id,
        dataUrl: `data:${mime[extname(sound.file).toLowerCase()]};base64,${data.toString('base64')}`,
        volume: Math.min(1, sound.volume * this.settings().volume),
      });
      this.deadline(5000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.warn(`Audio: archivo=${sound.file}; id=${sound.id}; ${errorMessage(error)}`);
      this.finish();
    }
  }
  result(id: string, error?: string, phase: 'started' | 'ended' = 'started'): void {
    if (this.current?.id !== id) return;
    if (error) {
      this.warn(`Audio: archivo=${this.current.file}; id=${id}; ${error}`);
      this.send({ type: 'stopAudio' });
      this.finish();
    } else if (phase === 'ended') this.finish();
    else this.deadline(120_000);
  }
  private deadline(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.warn('Audio: tiempo máximo agotado; se continúa con el siguiente sonido');
      this.send({ type: 'stopAudio' });
      this.finish();
    }, ms);
  }
  private finish(): void {
    clearTimeout(this.timer);
    this.current = undefined;
    void this.pump();
  }
  stop(): void {
    this.generation++;
    this.waiting = [];
    clearTimeout(this.timer);
    this.current = undefined;
    this.send({ type: 'stopAudio' });
  }
}
