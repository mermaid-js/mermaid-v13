/**
 * The info corpora: the e2e fixtures (and the one `info` fixture under `state-diagram-v2`), the
 * harvested v12 spec strings, and the gate's set, which adds the cases in
 * `corpus/info-cases.json` (header and `showInfo` placement, statements, hidden tokens, line
 * ends and separators, unclosed directives) and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const json = (file: string): CorpusItem[] =>
  JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus', file), 'utf8')
  ) as CorpusItem[];

/** The fixture of another folder that is an info diagram (`FIXTURE_TYPE_EXCEPTIONS`). */
const ELSEWHERE = 'e2e/diagrams/state-diagram-v2/nightly-check/v2-should-render-a-simple-info.mmd';

/**
 * Cases whose id starts with this are core's, not info's: core's preprocess ends an unclosed
 * `%%{` at its line end and reports `UNCLOSED_DIRECTIVE`; v12's directive regex removed the line
 * break after it too, or every line after it. The gates leave them out, as pie's do.
 */
export const UNCLOSED_DIRECTIVE = 'unclosed directive ';

/** The info corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function infoCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/info'), 'e2e')) {
    items.push(item);
  }
  items.push({ id: ELSEWHERE, source: readFileSync(join(REPO_ROOT, ELSEWHERE), 'utf8') });
  return [...items, ...json('info-v12-specs.json')];
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function infoGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await infoCorpus()), ...json('info-cases.json')];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
