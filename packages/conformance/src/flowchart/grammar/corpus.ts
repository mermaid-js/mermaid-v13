import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, isEmbeddedFixture, REPO_ROOT } from '../../corpus.ts';
import type { CorpusItem } from '../../types.ts';

/**
 * The flowchart corpus of the lexer-parity gate: e2e fixtures plus the v12 spec strings. The
 * embedded-diagram fixtures are left out: v12 rejects them.
 */
export async function flowchartCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'e2e')) {
    if (!isEmbeddedFixture(item)) items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/flowchart-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}
