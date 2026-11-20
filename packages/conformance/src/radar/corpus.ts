/**
 * The radar corpora (#422): the e2e fixtures, the knsv dev diagram and the harvested v12 spec
 * strings, and the lexer gate's set, which adds the hand-written cases of
 * `corpus/radar-cases.json` (the spec's quirks, line separators) and a CRLF and a commented
 * copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusJson, fixturesAndSpecs, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** The knsv dev diagram the spec counts in the corpus (a front-matter title). */
const DEV_DIAGRAM = 'dev-diagrams/knsv/knsv2-03-radar.mmd';

/** The radar corpus: the e2e fixtures, the dev diagram and the harvested v12 spec strings. */
export const radarCorpus = (): Promise<CorpusItem[]> =>
  fixturesAndSpecs('radar', {
    extra: [{ id: DEV_DIAGRAM, source: readFileSync(join(REPO_ROOT, DEV_DIAGRAM), 'utf8') }],
  });

/**
 * The hand-written cases: the spec's quirks and the rules' other corners, and the parser's
 * recovery set (`radar-recovery.json`, whose expected diagnostics the radar package checks).
 */
export function radarCases(): CorpusItem[] {
  const recovery = corpusJson('radar-recovery.json');
  return [...corpusJson('radar-cases.json'), ...recovery.map(({ id, source }) => ({ id, source }))];
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
