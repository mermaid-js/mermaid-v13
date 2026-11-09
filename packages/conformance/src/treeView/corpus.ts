/**
 * The treeView corpora (#518): the e2e fixtures (the 12.2.0 files, the Cypress originals they
 * flattened, and v12's `parser.spec.ts` and `boxDrawingPreprocessor.spec.ts` inputs) and the
 * harvested v12 spec strings, and the gates' set, which adds the hand-written cases of
 * `corpus/treeView-cases.json` (the spec's quirks, the box pass's corners and errors) and
 * {@link LINE_SEPARATORS}, and a CRLF and a commented copy of every source.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
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

const E2E_DIR = 'e2e/diagrams/tree-view';

/**
 * The ids `treeViewCorpus` gives the e2e fixtures, from a listing of the folder: every `.mmd`
 * under it, so a spec counting the fixtures it reached follows a fixture added or removed.
 */
export function treeViewE2eIds(): string[] {
  return readdirSync(join(REPO_ROOT, E2E_DIR), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.mmd'))
    .map((file) => `e2e/${file.split(sep).join('/')}`)
    .sort();
}

/**
 * The fewest e2e fixtures there may be (#577): the 15 12.2.0 files, the 8 Cypress originals,
 * v12's 30 `parser.spec.ts` inputs, the 26 `boxDrawingPreprocessor.spec.ts` inputs it accepts
 * (30 `[…].join('\n')` inputs, one a repeat, three rejected: cases) and the 18 baselines. A
 * sanity floor under `treeViewE2eIds`, so an empty or misread folder fails.
 */
export const TREEVIEW_E2E_AT_LEAST = 15 + 8 + 30 + 26 + 18;

/** The treeView corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function treeViewCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, E2E_DIR), 'e2e')) {
    items.push(item);
  }
  return [...items, ...readItems('packages/conformance/corpus/treeView-v12-specs.json')];
}

/**
 * The hand-written cases: the spec's quirks, the box pass's corners and its errors
 * (`corpus/treeView-cases.json`), and the parser's recovery set (`treeView-recovery.json`,
 * whose expected diagnostics `recovery.spec.ts` checks).
 */
export function treeViewCases(): CorpusItem[] {
  return [
    ...readItems('packages/conformance/corpus/treeView-cases.json'),
    ...readItems('packages/conformance/corpus/treeView-recovery.json').map(({ id, source }) => ({
      id,
      source,
    })),
  ];
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
