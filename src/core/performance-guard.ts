import type { Job } from '../shared/model';
import {
  defaultWindows,
  type AdmissionDecision,
  type PerformanceLedger,
  type PerformanceSettings,
  type Reservation,
} from '../shared/performance';
import { Logger } from './logging';

/** Estimated load only. Never queries or removes entities, storms or Java processes. */
export class PerformanceGuard {
  private reservations: Reservation[] = [];
  private realCooldowns = { LIGHT: 0, MEDIUM: 0, HEAVY: 0, EXTREME: 0 };
  private simulatedCooldowns = { ...this.realCooldowns };
  constructor(
    private readonly settings: () => PerformanceSettings,
    private readonly log: Logger,
    private readonly persist: (ledger: PerformanceLedger) => void,
    ledger?: PerformanceLedger,
    private readonly now = Date.now,
  ) {
    if (ledger) {
      this.realCooldowns = { ...ledger.cooldowns };
      this.reservations = ledger.reservations
        .filter((r) => r.active || r.until > now())
        .map((r) => ({
          ...r,
          active: false,
          simulated: false,
          until: r.active ? Math.max(r.until, now() + r.windowMs) : r.until,
        }));
      this.save();
      if (this.reservations.length)
        log.write(
          'WARN',
          'QUEUE',
          'Reservas de carga estimada recuperadas; no representan medición de Minecraft',
          { count: this.reservations.length },
        );
    }
  }
  private save(): void {
    this.persist({
      reservations: this.reservations.filter((r) => !r.simulated).map(({ simulated: _sim, ...r }) => r),
      cooldowns: this.realCooldowns,
    });
  }
  tick(): void {
    const expired = this.reservations.filter((r) => !r.active && r.until <= this.now());
    if (!expired.length) return;
    const before = this.reservations;
    this.reservations = before.filter((r) => !expired.includes(r));
    try {
      if (expired.some((r) => !r.simulated)) this.save();
    } catch (error) {
      this.reservations = before;
      throw error;
    }
    for (const r of expired)
      this.log.write(
        'INFO',
        'QUEUE',
        `Reserva estimada vencida/liberada: ${r.tier}${r.simulated ? ' [DRY RUN]' : ''}`,
        { reservationId: r.id },
      );
  }
  get snapshot() {
    return { enabled: this.settings().enabled, reservations: this.reservations.map((r) => ({ ...r })) };
  }
  inspect(job: Job, simulated: boolean): AdmissionDecision {
    this.tick();
    const cost = job.performance?.cost;
    if (!cost || !this.settings().enabled) return { kind: 'ALLOW' };
    const tier = this.settings().tiers[cost];
    const reservations = this.reservations.filter((r) => r.tier === cost && r.simulated === simulated);
    const cooldown = (simulated ? this.simulatedCooldowns : this.realCooldowns)[cost];
    const capacityUntil =
      reservations.length >= tier.capacity
        ? Math.min(...reservations.map((r) => (r.active ? this.now() + 100 : r.until)))
        : 0;
    const until = Math.max(capacityUntil, cooldown);
    if (until <= this.now()) return { kind: 'ALLOW' };
    const reason = `${cost}: espera de capacidad/cooldown estimado hasta ${new Date(until).toISOString()}`;
    return this.settings().policy === 'DROP' ? { kind: 'DROP', reason } : { kind: 'WAIT', until, reason };
  }
  begin(job: Job, simulated: boolean): void {
    const cost = job.performance?.cost;
    if (!cost || !this.settings().enabled) return;
    const windowMs = job.performance?.windowMs ?? defaultWindows[cost];
    const r: Reservation = {
      id: job.id,
      tier: cost,
      windowMs,
      until: this.now() + windowMs,
      active: true,
      simulated,
    };
    const cooldowns = simulated ? this.simulatedCooldowns : this.realCooldowns;
    const previous = cooldowns[cost];
    this.reservations.push(r);
    cooldowns[cost] = this.now() + this.settings().tiers[cost].cooldownMs;
    try {
      if (!simulated) this.save();
    } catch (error) {
      this.reservations.pop();
      cooldowns[cost] = previous;
      throw error;
    }
    this.log.write(
      'INFO',
      'QUEUE',
      `Capacidad reservada: ${cost}${simulated ? ' [DRY RUN]' : ''}; ventana estimada ${windowMs} ms tras ejecución`,
      { jobId: job.id },
    );
  }
  finish(job: Job): void {
    const r = this.reservations.find((r) => r.id === job.id);
    if (!r) return;
    r.active = false;
    r.until = this.now() + r.windowMs;
    if (!r.simulated) this.save();
    this.log.write(
      'INFO',
      'QUEUE',
      `Reserva ${r.tier} conservada hasta ${new Date(r.until).toISOString()}; no se eliminaron efectos de Minecraft`,
      { jobId: job.id },
    );
    this.tick();
  }
}
