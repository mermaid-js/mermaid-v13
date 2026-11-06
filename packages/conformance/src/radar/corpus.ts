/**
 * The radar corpora (#422): the e2e fixtures, the knsv dev diagram and the harvested v12 spec
 * strings, and the lexer gate's set, which adds the hand-written cases of
 * `corpus/radar-cases.json` (the spec's quirks, line separators) and a CRLF and a commented
 * copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8');
const readItems = (file: string) => JSON.parse(read(file)) as CorpusItem[];

/** The knsv dev diagram the spec counts in the corpus (a front-matter title). */
const DEV_DIAGRAM = 'dev-diagrams/knsv/knsv2-03-radar.mmd';

/** The radar corpus: the e2e fixtures, the dev diagram and the harvested v12 spec strings. */
export async function radarCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/radar'), 'e2e')) {
    items.push(item);
  }
  items.push({ id: DEV_DIAGRAM, source: read(DEV_DIAGRAM) });
  return [...items, ...readItems('packages/conformance/corpus/radar-v12-specs.json')];
}

/** The hand-written cases: the spec's quirks and the rules' other corners. */
export function radarCases(): CorpusItem[] {
  return readItems('packages/conformance/corpus/radar-cases.json');
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function radarGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await radarCorpus()), ...radarCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
