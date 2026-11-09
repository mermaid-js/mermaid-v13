/**
 * The treeView corpora (#518): the e2e fixtures (the 12.2.0 files, the Cypress originals they
 * flattened, and v12's `parser.spec.ts` and `boxDrawingPreprocessor.spec.ts` inputs) and the
 * harvested v12 spec strings, and the gates' set, which adds the hand-written cases of
 * `corpus/treeView-cases.json` (the spec's quirks, the box pass's corners and errors) and
 * {@link LINE_SEPARATORS}, and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const readItems = (file: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')) as CorpusItem[];

const H = 'treeView-beta\n';

/**
 * U+2028 and U+2029: `\s` (blank runs that reach a box glyph, `trim()`, `\s*{`) and v12's
 * comment-line removal (`^`, multiline) treat them as line terminators; NL, `[^\n\r]`, the
 * box pass's line split and `[ \t]` do not. Each in a name, a description, a `%%` comment, a
 * title, an accessibility line, a quoted name, a box line and the header.
 */
export const LINE_SEPARATORS: CorpusItem[] = [
  H + '  a\u2028b\n  c',
  H + '  a\u2029  b',
  H + '  a ## d\u2028e\n  b',
  H + '  a ##\u2029d',
  H + '  a :::x\u2028:::y',
  H + '  a icon(x)\u2028## d',
  H + '%% c\u2028  a\n  b',
  H + '  a\n  %% c\u2028d\n  b',
  H + '  a %% c\u2029d',
  H + '\u2028%% c\n  a',
  H + 'title a\u2028b\n  c',
  H + 'title\u2028a\n  b',
  H + 'accTitle: a\u2028b\n  c',
  H + 'accTitle:\u2029a\n  b',
  H + 'accDescr: a\u2028b\n  c',
  H + 'accDescr\u2028{ a }\n  b',
  H + '  "a\u2028b"\n  c',
  H + "  'a\u2029b' ## d",
  H + '├── a\u2028b\n└── c',
  H + '├── a ## d\u2029e\n└── c',
  H + '\u2028├── a',
  H + '├── a\n\u2029  └── b',
  H + '%% ├── a\u2028  b',
  'treeView-beta\u2028  a',
  'treeView-beta\u2029\n├── a',
].map((source, k) => ({ id: `line separators ${k}`, source }));

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

/** The corpus, the cases, the line-separator cases, and a CRLF and a commented copy of each. */
export async function treeViewGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await treeViewCorpus()), ...treeViewCases(), ...LINE_SEPARATORS];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
