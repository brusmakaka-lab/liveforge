import { randomUUID } from 'node:crypto';
import type { AudioService, OverlayService } from '../adapters/contracts';
import type { MediaMessage } from '../shared/api';
import type { InternalLiveEvent, Rule, Settings } from '../shared/model';
import { alertDetails, type AlertDetails, type Impact } from '../shared/media';
import { AlertStore } from '../core/alert-store';
import { renderTemplate } from '../core/templates';
import { AudioQueue } from './audio-queue';

export class DesktopMedia implements AudioService, OverlayService {
  readonly alerts: AlertStore;
  readonly sounds: AudioQueue;
  private timer: ReturnType<typeof setInterval>;
  constructor(
    send: (message: MediaMessage) => void,
    audio: () => Settings['audio'],
    warn: (message: string) => void,
  ) {
    this.alerts = new AlertStore((alerts) => send({ type: 'alerts', alerts }));
    this.sounds = new AudioQueue(send, audio, warn);
    this.timer = setInterval(() => this.alerts.tick(), 100);
    this.timer.unref();
  }
  play(file: string, volume: number, signal?: AbortSignal, impact?: Impact): Promise<void> {
    return this.sounds.play(file, volume, signal, impact);
  }
  result(id: string, error?: string, phase?: 'started' | 'ended'): void {
    this.sounds.result(id, error, phase);
  }
  async show(text: string, duration: number, details?: AlertDetails): Promise<void> {
    this.alerts.show(
      text,
      duration,
      details ?? {
        id: randomUUID(),
        username: '',
        giftName: '',
        quantity: 1,
        impact: 'NORMAL',
        activeStreak: false,
      },
    );
  }
  progress(rule: Rule, event: InternalLiveEvent, player: string, totalLikes: number): void {
    for (const action of rule.actions) {
      if (action.type !== 'ShowAlert') continue;
      const details = alertDetails(event, rule.id, action.id, rule.impact);
      details.progress = true;
      details.icon = action.icon;
      details.customImage = action.customImage;
      if (action.showGiftImage === false) details.image = undefined;
      this.alerts.show(
        renderTemplate(
          action.text,
          {
            player,
            totalLikes,
            likeCount: 0,
            username: event.user.username,
            nickname: event.user.nickname,
            giftName: details.giftName,
            giftCount: details.quantity,
          },
          'text',
        ),
        action.duration,
        details,
      );
    }
  }
  stop(): void {
    this.sounds.stop();
    this.alerts.clear();
  }
  dispose(): void {
    clearInterval(this.timer);
    this.stop();
  }
}
