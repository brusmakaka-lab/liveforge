import { eventSchema, type InternalLiveEvent } from '../shared/model';

export class EventBus {
  private listeners = new Set<(event: InternalLiveEvent) => void>();
  constructor(private readonly onError: (error: unknown) => void) {}
  subscribe(listener: (event: InternalLiveEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  publish(input: unknown): void {
    const event = eventSchema.parse(input);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.onError(error);
      }
    }
  }
}

/** Bounded insertion-ordered TTL cache; timestamps use local monotonic arrival order. */
export class Deduplicator {
  private seen = new Map<string, number>();
  constructor(
    private readonly ttl = 300_000,
    private readonly capacity = 20_000,
    private readonly now = Date.now,
  ) {}
  accept(id: string): boolean {
    const now = this.now();
    for (const [key, time] of this.seen) {
      if (now - time < this.ttl) break;
      this.seen.delete(key);
    }
    if (this.seen.has(id)) return false;
    this.seen.set(id, now);
    while (this.seen.size > this.capacity) {
      const key = this.seen.keys().next().value;
      if (key !== undefined) this.seen.delete(key);
    }
    return true;
  }
  clear(): void {
    this.seen.clear();
  }
  get size(): number {
    return this.seen.size;
  }
}

export class GiftStreakTracker {
  private streaks = new Map<string, { count: number; ended: boolean; time: number }>();
  constructor(private readonly now = Date.now) {}
  update(event: Extract<InternalLiveEvent, { type: 'GIFT' }>): { delta: number; final: number } {
    const now = this.now();
    for (const [key, value] of this.streaks) {
      if (now - value.time > 600_000) this.streaks.delete(key);
    }
    const p = event.payload;
    if (!p.streak) return { delta: p.repeatCount, final: p.repeatCount };
    const key = `${event.user.id}:${p.giftId}:${p.streakId}`;
    const prev = this.streaks.get(key);
    if (prev?.ended) return { delta: 0, final: 0 };
    const highest = Math.max(prev?.count ?? 0, p.repeatCount);
    this.streaks.set(key, { count: highest, ended: p.repeatEnd, time: now });
    if (this.streaks.size > 10_000) {
      const first = this.streaks.keys().next().value;
      if (first) this.streaks.delete(first);
    }
    return { delta: Math.max(0, p.repeatCount - (prev?.count ?? 0)), final: p.repeatEnd ? highest : 0 };
  }
  clear(): void {
    this.streaks.clear();
  }
}
