/**
 * The event modeling corpora (#527): the e2e fixtures and the harvested v12 spec strings, and
 * the gates' set, which adds the hand-written cases of `corpus/eventmodeling-cases.json` (the
 * spec's quirks, line separators, other `\s` characters, the parser's cases) and
 * `corpus/eventmodeling-recovery.json`, and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const readItems = (file: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')) as CorpusItem[];

/** The event modeling corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function eventModelingCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/eventmodeling'), 'e2e')) {
    items.push(item);
  }
  return [...items, ...readItems('packages/conformance/corpus/eventmodeling-v12-specs.json')];
}

/**
 * The hand-written cases: the spec's quirks and the rules' other corners, the parser's cases
 * (`parser-*`), and the parser's recovery set (`eventmodeling-recovery.json`, whose expected
 * diagnostics `recovery.spec.ts` checks).
 */
export function eventModelingCases(): CorpusItem[] {
  const recovery = readItems('packages/conformance/corpus/eventmodeling-recovery.json');
  return [
    ...readItems('packages/conformance/corpus/eventmodeling-cases.json'),
    ...recovery.map(({ id, source }) => ({ id, source })),
  ];
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function eventModelingGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await eventModelingCorpus()), ...eventModelingCases()];
  return [
    ...all,
    ...all.map((item) => ({
      id: `${item.id} (CRLF)`,
      source: item.source.replace(/\r?\n/g, '\r\n'),
    })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
