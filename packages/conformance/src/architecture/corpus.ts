/**
 * The architecture corpora (#525): the e2e fixtures and the harvested v12 spec strings, and the
 * gates' set, which adds the hand-written cases of `corpus/architecture-cases.json` (the spec's
 * quirks, line separators, one case per v12 DB check) and the parser's recovery set
 * (`corpus/architecture-recovery.json`, #599), and a CRLF and a commented copy of every source.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { corpusJson, fixturesAndSpecs, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The number of `.mmd` fixtures under `e2e/diagrams/architecture/`, every tier and the
 * baselines: the specs that check each reaches the gates count against this, so a new fixture
 * needs no count edited.
 */
export const E2E_FIXTURES = readdirSync(join(REPO_ROOT, 'e2e/diagrams/architecture'), {
  recursive: true,
  encoding: 'utf8',
}).filter((f) => f.endsWith('.mmd')).length;

/** The architecture corpus: the e2e fixtures and the harvested v12 spec strings. */
export const architectureCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('architecture');

/**
 * The hand-written cases: the spec's quirks and the rules' other corners, one case per v12 DB
 * check (`db-*`), and the parser's recovery set (whose expected diagnostics `recovery.spec.ts`
 * checks).
 */
export function architectureCases(): CorpusItem[] {
  const recovery = corpusJson('architecture-recovery.json');
  return [
    ...corpusJson('architecture-cases.json'),
    ...recovery.map(({ id, source }) => ({ id, source })),
  ];
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
