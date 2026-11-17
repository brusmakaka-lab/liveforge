import { impactRank, type AlertDetails, type AlertView } from '../shared/media';

/** Presentation only: never schedules gameplay or infers a missing gift final. */
export class AlertStore {
  private active = new Map<string, AlertView>();
  private closed = new Map<string, number>();
  constructor(
    private readonly changed: (alerts: AlertView[]) => void,
    private readonly now = Date.now,
  ) {}
  get snapshot(): AlertView[] {
    return [...this.active.values()];
  }
  show(text: string, duration: number, details: AlertDetails): void {
    this.tick();
    if (this.closed.has(details.id)) return;
    const previous = this.active.get(details.id);
    if (previous?.progress && !details.progress) return;
    if (
      previous &&
      (details.quantity < previous.quantity || (!previous.activeStreak && details.activeStreak))
    )
      return;
    if (!previous && this.active.size >= 3) {
      const victim = this.snapshot.sort((a, b) => impactRank[a.impact] - impactRank[b.impact])[0]!;
      if (impactRank[victim.impact] > impactRank[details.impact]) {
        this.close(details.id);
        return;
      }
      this.active.delete(victim.id);
      this.close(victim.id);
    }
    this.active.set(details.id, {
      ...details,
      text,
      leaving: false,
      expiresAt: this.now() + (details.activeStreak ? 30_000 : Math.max(250, duration)),
    });
    this.changed(this.snapshot);
  }
  private close(id: string): void {
    this.closed.set(id, this.now());
    while (this.closed.size > 2000) this.closed.delete(this.closed.keys().next().value!);
  }
  tick(): void {
    const now = this.now();
    let changed = false;
    for (const [id, time] of this.closed) if (now - time > 600_000) this.closed.delete(id);
    for (const [id, alert] of this.active) {
      if (now >= alert.expiresAt + 250) {
        this.active.delete(id);
        this.close(id);
        changed = true;
      } else if (now >= alert.expiresAt && !alert.leaving) {
        alert.leaving = true;
        changed = true;
      }
    }
    if (changed) this.changed(this.snapshot);
  }
  clear(): void {
    this.active.clear();
    this.closed.clear();
    this.changed([]);
  }
}
