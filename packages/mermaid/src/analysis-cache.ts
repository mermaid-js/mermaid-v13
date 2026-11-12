import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { Prepared } from './api-types.ts';
import type { Snapshot } from './config-snapshot.ts';
import type { AnyPlugin, Detected } from './registry.ts';

/** What the API object keeps of one parsed text (DESIGN §3 steps 1–4). */
export interface Analysis {
  readonly detected: Detected;
  readonly plugin: AnyPlugin;
  readonly prepared: Prepared;
  /** The front-matter title, for text output (D82). */
  readonly title?: string;
  /** The author's config layers (`initialize`, front matter, directives), for line hops (D537). */
  readonly sources: readonly (Readonly<Record<string, unknown>> | undefined)[];
}

/** What `detect` found. */
export interface Detection {
  readonly detected: Detected;
  readonly pre: PreprocessResult;
}

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
