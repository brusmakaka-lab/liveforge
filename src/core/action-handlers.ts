import { setTimeout as sleep } from 'node:timers/promises';
import type { AudioService, GameAdapter, OverlayService } from '../adapters/contracts';
import { ActionQueue } from './queue';
import { Logger } from './logging';
import { alertDetails, type Impact } from '../shared/media';
import { renderTemplate } from './templates';

export function registerActionHandlers(
  queue: ActionQueue,
  services: {
    game: () => GameAdapter<{ type: 'command'; command: string }>;
    audio: AudioService;
    overlay: OverlayService;
    log: Logger;
  },
): void {
  let lastCommand = 0;
  queue.register('MinecraftCommand', async (action, context) => {
    if (action.type !== 'MinecraftCommand') return;
    const command = renderTemplate(action.command, context.job.variables);
    if (context.dryRun) {
      services.log.write('INFO', 'MINECRAFT', `[DRY RUN] Would execute: ${command}`);
      return;
    }
    const delay = Math.max(0, lastCommand + 100 - Date.now());
    if (delay) await sleep(delay, undefined, { signal: context.signal });
    context.signal.throwIfAborted();
    if (queue.dryRun) {
      services.log.write('INFO', 'MINECRAFT', `[DRY RUN] Would execute: ${command}`);
      return;
    }
    lastCommand = Date.now();
    await services.game().execute({ type: 'command', command });
  });
  queue.register('Wait', async (action, context) => {
    if (action.type === 'Wait') await sleep(action.duration, undefined, { signal: context.signal });
  });
  queue.register('PlaySound', async (action, context) => {
    if (action.type === 'PlaySound')
      await services.audio.play(
        action.file,
        action.volume,
        context.signal,
        (context.job.variables.impact ?? 'NORMAL') as Impact,
      );
  });
  queue.register('ShowAlert', async (action, context) => {
    if (action.type === 'ShowAlert') {
      const details = alertDetails(
        context.job.event,
        context.job.ruleId,
        action.id,
        (context.job.variables.impact ?? 'NORMAL') as Impact,
      );
      details.activeStreak = false; // Ongoing progress is driven only by the explicitly enabled rule observer.
      details.icon = action.icon;
      details.customImage = action.customImage;
      if (action.showGiftImage === false) details.image = undefined;
      await services.overlay.show(
        renderTemplate(action.text, context.job.variables, 'text'),
        action.duration,
        details,
      );
    }
  });
  queue.register('LogMessage', async (action, context) => {
    if (action.type === 'LogMessage')
      services.log.write('INFO', 'ACTION', renderTemplate(action.message, context.job.variables, 'text'));
  });
}
