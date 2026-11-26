/**
 * The `commented()` copy of each type's fixture with a `%%` line above its front matter
 * (`<type>/nightly-check/comment-before-frontmatter.mmd`, D704). `commented()` finds front
 * matter with v12's regex, misses that one and puts comment lines inside its YAML; core reads
 * the front matter and rejects the YAML, which v12 never read. Divergence ids are global and
 * every type's gate gives this copy the same id, so the parity specs exclude it and check here
 * that it still differs for that reason.
 */
import { runParity } from './runner.ts';
import type { CorpusItem, DiagramAdapter, ItemResult } from './types.ts';

export const BEFORE_FENCE_COMMENTED =
  'e2e/nightly-check/comment-before-frontmatter.mmd (commented)';

/** The parity results for the excluded copy, run with no listed divergences. */
export async function beforeFenceResults<M>(
  adapter: DiagramAdapter<M>,
  corpus: readonly CorpusItem[]
): Promise<{ items: CorpusItem[]; results: ItemResult[] }> {
  const items = corpus.filter((i) => i.id === BEFORE_FENCE_COMMENTED);
  const report = await runParity({ adapters: [adapter], corpus: items, divergences: [] });
  return { items, results: report.results };
}
