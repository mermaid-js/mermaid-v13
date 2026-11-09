/**
 * The architecture corpora (#525): the e2e fixtures and the harvested v12 spec strings, and the
 * lexer gate's set, which adds the hand-written cases of `corpus/architecture-cases.json` (the
 * spec's quirks, line separators) and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const readItems = (file: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')) as CorpusItem[];

/** The architecture corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function architectureCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/architecture'), 'e2e')) {
    items.push(item);
  }
  return [...items, ...readItems('packages/conformance/corpus/architecture-v12-specs.json')];
}

/** The hand-written cases: the spec's quirks and the rules' other corners. */
export function architectureCases(): CorpusItem[] {
  return readItems('packages/conformance/corpus/architecture-cases.json');
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function architectureGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await architectureCorpus()), ...architectureCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
