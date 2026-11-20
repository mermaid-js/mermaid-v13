/**
 * The AST ids of one parse by mention (D458, pitfall 9), shared by the c4 parser (`build.ts`)
 * and the c4-beta parser: `base` the first time, then `base@2`, `base@3`, …
 */
import type { AstId } from '@mermaid-js/core/parser-kit';

/** Hands out the ids of one parse. Create one per parse; ids depend on call order. */
export class MentionIds {
  private readonly seen = new Map<string, number>();

  /** `base`, then `base@2`, `base@3`, … for later mentions. */
  next(base: string): AstId {
    const n = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }
}
