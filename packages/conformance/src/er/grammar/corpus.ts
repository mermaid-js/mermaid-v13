import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../../corpus.ts';
import type { CorpusItem } from '../../types.ts';

/** The ER corpus: e2e fixtures plus the v12 spec strings. */
export async function erCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/er-diagram'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/er-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}
