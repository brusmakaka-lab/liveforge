import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Action, Job, LeafAction } from '../shared/model';
import { Logger, errorMessage } from './logging';
import { weightedChoice } from './templates';
import type { PerformanceGuard } from './performance-guard';

export type ActionContext = { job: Job; signal: AbortSignal; dryRun: boolean };
export type ActionHandler = (action: LeafAction, context: ActionContext) => Promise<void>;
const rank = { LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 };

export class ActionQueue {
  private jobs: Job[] = [];
  private running = false;
  private controller?: AbortController;
  private wake?: ReturnType<typeof setTimeout>;
  private handlers = new Map<LeafAction['type'], ActionHandler>();
  paused = false;
  dryRun = true;
  completed = 0;
  constructor(
    private readonly log: Logger,
    readonly capacity = 500,
    private readonly random = Math.random,
    private readonly admission?: PerformanceGuard,
  ) {}
  register(type: LeafAction['type'], handler: ActionHandler): void {
    this.handlers.set(type, handler);
  }
  get snapshot(): Job[] {
    return this.jobs;
  }
  get pendingCount(): number {
    return this.jobs.filter((j) => j.status === 'QUEUED').length;
  }
  enqueue(input: Omit<Job, 'id' | 'status' | 'createdAt'>): Job | undefined {
    if (this.pendingCount >= this.capacity) {
      this.log.write('WARN', 'QUEUE', 'Cola llena: evento descartado', { ruleId: input.ruleId });
      return;
    }
    const job: Job = { ...structuredClone(input), id: randomUUID(), status: 'QUEUED', createdAt: Date.now() };
    this.jobs.push(job);
    this.prune();
    this.log.write('INFO', 'QUEUE', `${job.ruleName} → QUEUED`, { jobId: job.id, eventId: job.eventId });
    void this.pump();
    return job;
  }
  pause(): void {
    this.paused = true;
    this.log.write('INFO', 'QUEUE', 'Cola pausada');
  }
  resume(): void {
    this.paused = false;
    this.log.write('INFO', 'QUEUE', 'Cola reanudada');
    void this.pump();
  }
  clear(ruleId?: string): void {
    for (const job of this.jobs)
      if (job.status === 'QUEUED' && (!ruleId || job.ruleId === ruleId)) {
        job.status = 'CANCELLED';
        job.finishedAt = Date.now();
      }
    this.prune();
    this.log.write('INFO', 'QUEUE', 'Trabajos pendientes cancelados', { ruleId });
  }
  stop(): void {
    this.pause();
    this.clear();
    this.controller?.abort();
    if (this.wake) clearTimeout(this.wake);
  }
  earliestDue(ruleId: string): number | undefined {
    return this.jobs.find((j) => j.ruleId === ruleId && j.status === 'QUEUED')?.notBefore;
  }
  private prune(): void {
    const done = this.jobs.filter((j) => !['QUEUED', 'RUNNING'].includes(j.status));
    const remove = new Set(done.slice(0, Math.max(0, done.length - 100)).map((j) => j.id));
    this.jobs = this.jobs.filter((j) => !remove.has(j.id));
  }
  private async checkpoint(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    while (this.paused) {
      await sleep(50, undefined, { signal });
    }
    signal.throwIfAborted();
  }
  private async execute(
    actions: Action[],
    job: Job,
    signal: AbortSignal,
    budget: { remaining: number },
  ): Promise<void> {
    for (const action of actions) {
      await this.checkpoint(signal);
      if (action.delayBefore) await sleep(action.delayBefore, undefined, { signal });
      for (let i = 0; i < action.repeatCount; i++) {
        await this.checkpoint(signal);
        if (--budget.remaining < 0) throw new Error('Límite de 2.000 pasos por trabajo excedido');
        if (i && action.intervalBetweenRepeats) {
          await sleep(action.intervalBetweenRepeats, undefined, { signal });
          await this.checkpoint(signal);
        }
        if (action.type === 'ActionPool') {
          const selected = weightedChoice(action.entries, this.random);
          this.log.write('INFO', 'ACTION', `Pool → ${selected.name}`);
          await this.execute(selected.actions, job, signal, budget);
          continue;
        }
        const handler = this.handlers.get(action.type);
        try {
          if (!handler) throw new Error(`Sin handler: ${action.type}`);
          await handler(action, { job, signal, dryRun: this.dryRun || job.dryRun });
        } catch (error) {
          if (signal.aborted) throw error;
          this.log.write(action.type === 'PlaySound' ? 'WARN' : 'ERROR', 'ACTION', errorMessage(error), {
            actionId: action.id,
            jobId: job.id,
          });
          if (action.type !== 'PlaySound') {
            job.error = errorMessage(error);
            if (job.errorPolicy === 'STOP_JOB') throw error;
          }
        }
      }
    }
  }
  private async pump(): Promise<void> {
    if (this.running || this.paused) return;
    if (this.wake) clearTimeout(this.wake);
    const pending = this.jobs.filter((j) => j.status === 'QUEUED');
    const candidates = pending
      .filter((j) => j.notBefore <= Date.now())
      .sort((a, b) => rank[b.priority] - rank[a.priority] || a.createdAt - b.createdAt);
    let job: Job | undefined;
    for (const candidate of candidates) {
      try {
        const decision = this.admission?.inspect(candidate, this.dryRun || candidate.dryRun);
        if (decision?.kind === 'DROP') {
          candidate.status = 'CANCELLED';
          candidate.finishedAt = Date.now();
          candidate.error = decision.reason;
          this.log.write('WARN', 'QUEUE', `Evento descartado: ${decision.reason}`, { jobId: candidate.id });
          continue;
        }
        if (decision?.kind === 'WAIT') {
          if (candidate.waitReason !== decision.reason)
            this.log.write('INFO', 'QUEUE', `Evento en espera: ${decision.reason}`, { jobId: candidate.id });
          candidate.waitReason = decision.reason;
          candidate.admissionAt = decision.until;
          continue;
        }
        candidate.waitReason = undefined;
        candidate.admissionAt = undefined;
        job = candidate;
        break;
      } catch (error) {
        candidate.status = 'FAILED';
        candidate.finishedAt = Date.now();
        candidate.error = errorMessage(error);
        this.log.write('ERROR', 'QUEUE', `Admisión bloqueada: ${candidate.error}`);
      }
    }
    if (!job) {
      const waiting = pending.filter((j) => j.status === 'QUEUED');
      if (waiting.length)
        this.wake = setTimeout(
          () => {
            void this.pump();
          },
          Math.max(
            10,
            Math.min(...waiting.map((j) => Math.max(j.notBefore, j.admissionAt ?? 0))) - Date.now(),
          ),
        );
      return;
    }
    this.running = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    job.status = 'RUNNING';
    job.startedAt = Date.now();
    this.log.write('INFO', 'QUEUE', `${job.ruleName} → RUNNING`);
    try {
      // A protected sequence admitted in DRY RUN stays simulated even if the global switch changes.
      if (job.performance && this.admission) job.dryRun ||= this.dryRun;
      this.admission?.begin(job, this.dryRun || job.dryRun);
      await this.execute(job.actions, job, signal, { remaining: 2000 });
      signal.throwIfAborted();
      job.status = job.error ? 'FAILED' : 'COMPLETED';
      if (job.status === 'COMPLETED') this.completed++;
    } catch (error) {
      job.status = signal.aborted ? 'CANCELLED' : 'FAILED';
      job.error = errorMessage(error);
    } finally {
      try {
        this.admission?.finish(job);
      } catch (error) {
        this.log.write('ERROR', 'QUEUE', `Persistencia de reserva: ${errorMessage(error)}`);
      }
      job.finishedAt = Date.now();
      this.running = false;
      this.controller = undefined;
      this.log.write(job.status === 'FAILED' ? 'ERROR' : 'INFO', 'QUEUE', `${job.ruleName} → ${job.status}`, {
        jobId: job.id,
        error: job.error,
      });
      this.prune();
      // Yield so STOP/IPC and pending events can run between jobs.
      this.wake = setTimeout(() => {
        void this.pump();
      }, 10);
    }
  }
}
