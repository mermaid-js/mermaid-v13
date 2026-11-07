/**
 * The packet corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds the cases of `corpus/packet-cases.json` (the quirks spec #421 lists, line
 * separators, unclosed directives) and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const readCorpus = (name: string) =>
  JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus', name), 'utf8')
  ) as CorpusItem[];

/** The packet corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function packetCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/packet'), 'e2e')) {
    items.push(item);
  }
  return [...items, ...readCorpus('packet-v12-specs.json')];
}

/** The parser and lexer cases (`corpus/packet-cases.json`). */
export const packetCases = (): CorpusItem[] => readCorpus('packet-cases.json');

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function packetGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await packetCorpus()), ...packetCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
