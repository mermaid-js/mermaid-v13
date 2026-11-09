/**
 * The treeView corpora (#518): the e2e fixtures (the 12.2.0 files, the Cypress originals they
 * flattened, and v12's `parser.spec.ts` and `boxDrawingPreprocessor.spec.ts` inputs) and the
 * harvested v12 spec strings, and the gates' set, which adds the hand-written cases of
 * `corpus/treeView-cases.json` (the spec's quirks, the box pass's corners and errors, line
 * separators) and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const readItems = (file: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')) as CorpusItem[];

/** The treeView corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function treeViewCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/tree-view'), 'e2e')) {
    items.push(item);
  }
  return [...items, ...readItems('packages/conformance/corpus/treeView-v12-specs.json')];
}

/** The hand-written cases: the spec's quirks, the box pass's corners and its errors. */
export function treeViewCases(): CorpusItem[] {
  return readItems('packages/conformance/corpus/treeView-cases.json');
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function treeViewGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await treeViewCorpus()), ...treeViewCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
