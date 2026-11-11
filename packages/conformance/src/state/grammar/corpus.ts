import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, isEmbeddedFixture, REPO_ROOT } from '../../corpus.ts';
import type { CorpusItem } from '../../types.ts';

/**
 * The state corpus: e2e fixtures of both keywords (D104) plus the v12 spec strings. The
 * embedded-diagram fixtures are left out: v12 rejects them.
 */
export async function stateCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for (const dir of ['e2e/diagrams/state-diagram', 'e2e/diagrams/state-diagram-v2']) {
    for await (const item of corpusFromDir(join(REPO_ROOT, dir), dir)) {
      if (!isEmbeddedFixture(item)) items.push(item);
    }
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/state-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}
