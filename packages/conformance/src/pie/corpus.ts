/**
 * The pie corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's set,
 * which adds the cases (`corpus/pie-cases.json`: the quirks the spec lists, #288, parser and
 * line-separator cases) and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The parser and lexer cases (`corpus/pie-cases.json`): line-separator cases, the quirks the
 * spec probed against 2.0.1 (#288 "Parser"), the parser and model cases (#305), and unclosed
 * `%%{` directives (ids `pie-cases/unclosed directive …`; core's preprocess ends one at its line
 * end and reports `UNCLOSED_DIRECTIVE`, where v12's directive regex removed the line break after
 * it too, so the specs leave those out).
 */
function pieCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/pie-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The pie corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function pieCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/pie'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/pie-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function pieGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await pieCorpus()), ...pieCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
