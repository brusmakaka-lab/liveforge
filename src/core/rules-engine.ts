import { randomUUID } from 'node:crypto';
import type { InternalLiveEvent, LiveSession, Rule } from '../shared/model';
import { Deduplicator, GiftStreakTracker } from './events';
import { Logger, errorMessage } from './logging';
import { ActionQueue } from './queue';
import { matchesGift, planGiftActions } from './gift-actions';
import { defaultWindows, type PerformanceSettings } from '../shared/performance';

export class RulesEngine {
  session: LiveSession;
  enabled = false;
  private dedup: Deduplicator;
  private gifts: GiftStreakTracker;
  private nextAllowed = new Map<string, number>();
  private batches = new Map<string, number>();
  private remoteTotal = 0;
  private remoteBaseline = 0;
  constructor(
    private readonly queue: ActionQueue,
    private readonly rules: () => Rule[],
    private readonly player: () => string,
    private readonly log: Logger,
    private readonly now = Date.now,
    private readonly presentation: {
      progress?: (rule: Rule, event: InternalLiveEvent) => void;
      stop?: () => void;
    } = {},
    private readonly performance?: () => PerformanceSettings,
  ) {
    this.dedup = new Deduplicator(300_000, 20_000, now);
    this.gifts = new GiftStreakTracker(now);
    this.session = this.newSession('simulator');
  }
  private newSession(source: LiveSession['source']): LiveSession {
    return {
      id: randomUUID(),
      source,
      startedAt: this.now(),
      totalLikes: 0,
      receivedLikes: 0,
      triggeredThresholds: [],
      eventsReceived: 0,
      rulesTriggered: 0,
    };
  }
  startSession(source: LiveSession['source']): void {
    this.session = this.newSession(source);
    this.remoteTotal = 0;
    this.remoteBaseline = 0;
    this.dedup.clear();
    this.gifts.clear();
    this.nextAllowed.clear();
    this.batches.clear();
  }
  endSession(): void {
    this.session.endedAt = this.now();
  }
  resetCounters(): void {
    this.remoteBaseline = this.remoteTotal;
    this.session.totalLikes = 0;
    this.session.receivedLikes = 0;
    this.session.triggeredThresholds = [];
    this.session.eventsReceived = 0;
    this.session.rulesTriggered = 0;
    this.batches.clear();
    this.log.write('INFO', 'SYSTEM', 'Contadores y thresholds reiniciados');
  }
  get cooldowns(): Record<string, number> {
    return Object.fromEntries([...this.nextAllowed].filter(([, v]) => v > this.now()));
  }
  stop(): void {
    this.enabled = false;
    this.queue.stop();
    this.presentation.stop?.();
    this.log.write(
      'WARN',
      'SYSTEM',
      'STOP ALL EVENTS: triggers bloqueados; secuencias canceladas entre comandos',
    );
  }
  resume(): void {
    this.enabled = true;
    this.queue.resume();
    this.log.write('INFO', 'SYSTEM', 'Eventos habilitados');
  }
  forgetRule(id: string): void {
    this.nextAllowed.delete(id);
    this.batches.delete(id);
  }
  process(event: InternalLiveEvent): void {
    if (!this.dedup.accept(`${event.source}:${event.id}`)) {
      this.log.write('DEBUG', 'LIVE', 'Evento duplicado descartado', { eventId: event.id });
      return;
    }
    const test = Boolean(event.testRuleId);
    if (!test) {
      this.session.eventsReceived++;
      if (event.type === 'LIKE') {
        this.session.receivedLikes += event.payload.likeCount;
        if (event.payload.totalLikeCount !== undefined) {
          this.remoteTotal = Math.max(this.remoteTotal, event.payload.totalLikeCount);
          this.session.totalLikes = Math.max(this.session.totalLikes, this.remoteTotal - this.remoteBaseline);
        } else this.session.totalLikes += event.payload.likeCount;
      }
    }
    const gift = event.type === 'GIFT' ? this.gifts.update(event) : { delta: 0, final: 0 };
    if (!this.enabled) {
      this.log.write('DEBUG', 'RULE', 'Triggers detenidos: evento sólo observado');
      return;
    }
    for (const rule of this.rules()) {
      if (rule.availability && rule.availability !== 'READY') continue;
      if (test && event.testRuleId !== rule.id) continue;
      if (!test && !rule.enabled) continue;
      try {
        if (
          rule.showStreakProgress &&
          event.type === 'GIFT' &&
          event.payload.streak &&
          (gift.delta > 0 || gift.final > 0) &&
          rule.trigger.type === 'GIFT' &&
          matchesGift(rule.trigger, event.payload) &&
          (!rule.conditions.username ||
            rule.conditions.username.replace(/^@/, '').toLowerCase() === event.user.username.toLowerCase()) &&
          event.payload.repeatCount >= rule.conditions.minQuantity &&
          (event.payload.diamondCount ?? 0) * event.payload.repeatCount >= rule.conditions.minCoins
        ) {
          try {
            this.presentation.progress?.(rule, {
              ...event,
              payload: { ...event.payload, repeatCount: gift.final || event.payload.repeatCount },
            });
          } catch (error) {
            this.log.write('WARN', 'ACTION', 'Alerta de progreso: ' + errorMessage(error));
          }
        }
        this.evaluate(rule, event, gift, test);
      } catch (error) {
        this.log.write('ERROR', 'RULE', errorMessage(error), { ruleId: rule.id });
      }
    }
  }
  private evaluate(
    rule: Rule,
    event: InternalLiveEvent,
    gift: { delta: number; final: number },
    test: boolean,
  ): void {
    let times = 1;
    let quantity = event.type === 'GIFT' ? event.payload.repeatCount : 1;
    let thresholdKey: string | undefined;
    if (!test) {
      const t = rule.trigger;
      if (t.type === 'GIFT') {
        if (event.type !== 'GIFT') return;
        if (!matchesGift(t, event.payload)) return;
        quantity =
          t.mode === 'STREAK_END' ? gift.final : t.mode === 'STREAK_UPDATE' ? event.payload.repeatCount : 1;
        times =
          t.mode === 'STREAK_END'
            ? Number(gift.final > 0)
            : t.mode === 'STREAK_UPDATE'
              ? Number(gift.delta > 0)
              : gift.delta;
      } else if (t.type === 'LIKE_BATCH') {
        if (event.type !== 'LIKE') return;
        const accumulated = (this.batches.get(rule.id) ?? 0) + event.payload.likeCount;
        times = Math.floor(accumulated / t.amount);
        // Consumed batches are never replayed after cooldown/backpressure.
        this.batches.set(rule.id, accumulated % t.amount);
      } else if (t.type === 'TOTAL_LIKES_THRESHOLD') {
        if (event.type !== 'LIKE' || this.session.totalLikes < t.amount) return;
        thresholdKey = `${rule.id}:${t.amount}`;
        if (this.session.triggeredThresholds.includes(thresholdKey)) return;
      } else if (t.type === 'CHAT_COMMAND') {
        if (event.type !== 'CHAT') return;
        const message = event.payload.message.toLowerCase().trim();
        if (
          t.match === 'EXACT'
            ? message !== t.text.toLowerCase().trim()
            : !message.includes(t.text.toLowerCase())
        )
          return;
      } else if (t.type !== event.type) return;
      if (
        rule.conditions.username &&
        rule.conditions.username.replace(/^@/, '').toLowerCase() !== event.user.username.toLowerCase()
      )
        return;
      if (
        event.type === 'GIFT' &&
        (quantity < rule.conditions.minQuantity ||
          (event.payload.diamondCount ?? 0) * quantity < rule.conditions.minCoins)
      )
        return;
    }
    if (times > this.queue.capacity)
      this.log.write('WARN', 'RULE', 'Ráfaga limitada a la capacidad de la cola', {
        ruleId: rule.id,
        requested: times,
      });
    for (let i = 0; i < Math.min(times, this.queue.capacity); i++) {
      const now = this.now();
      const next = test ? 0 : (this.nextAllowed.get(rule.id) ?? 0);
      let due = now;
      if (now < next) {
        if (rule.cooldown.policy === 'IGNORE') {
          this.log.write('DEBUG', 'RULE', `${rule.name}: cooldown IGNORE`);
          return;
        }
        if (rule.cooldown.policy === 'REPLACE') {
          due = this.queue.earliestDue(rule.id) ?? next;
          this.queue.clear(rule.id);
        } else due = next;
      }
      const variables = {
        impact: rule.impact ?? 'NORMAL',
        player: this.player(),
        username: event.user.username,
        nickname: event.user.nickname,
        giftName: event.type === 'GIFT' ? event.payload.giftName : '',
        giftCount: quantity,
        likeCount: event.type === 'LIKE' ? event.payload.likeCount : 0,
        totalLikes:
          test && event.type === 'LIKE'
            ? (event.payload.totalLikeCount ?? this.session.totalLikes)
            : this.session.totalLikes,
      };
      const cleanEvent = { ...event, raw: undefined };
      const job = this.queue.enqueue({
        ruleId: rule.id,
        ruleName: rule.name,
        eventId: event.id,
        priority: rule.priority,
        actions:
          event.type === 'GIFT'
            ? planGiftActions(
                rule.actions,
                quantity,
                this.performance?.().enabled && rule.performanceCost
                  ? this.performance().tiers[rule.performanceCost].perItemCap
                  : 1000,
              )
            : rule.actions,
        performance: rule.performanceCost
          ? {
              cost: rule.performanceCost,
              windowMs: rule.performanceWindowMs ?? defaultWindows[rule.performanceCost],
            }
          : undefined,
        event: cleanEvent,
        variables,
        notBefore: due,
        errorPolicy: rule.errorPolicy,
        dryRun: this.queue.dryRun,
      });
      if (!job) return;
      if (!test) {
        this.session.rulesTriggered++;
        this.nextAllowed.set(rule.id, due + rule.cooldown.duration);
        if (thresholdKey) this.session.triggeredThresholds.push(thresholdKey);
      }
      this.log.write('INFO', 'RULE', `${test ? '[TEST] ' : ''}${rule.name}: regla coincidente`, {
        eventId: event.id,
        jobId: job.id,
        quantity,
      });
    }
  }
}
