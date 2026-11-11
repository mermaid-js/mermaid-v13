import type { Snapshot } from './config-snapshot.ts';

interface CacheEntry<A> {
  readonly snap: Snapshot;
  readonly analysis: A;
}

const CACHE_SIZE = 32;

/** The analyses of recent texts, each valid only for the snapshot it was made with. */
export class AnalysisCache<A> {
  private readonly entries = new Map<string, CacheEntry<A>>();

  get(text: string, snap: Snapshot): A | undefined {
    const hit = this.entries.get(text);
    return hit && hit.snap === snap ? hit.analysis : undefined;
  }

  set(text: string, snap: Snapshot, analysis: A): void {
    this.entries.delete(text);
    this.entries.set(text, { snap, analysis });
    if (this.entries.size > CACHE_SIZE) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void {
    this.entries.clear();
  }
}
