// cspell:words dedented
/**
 * The venn corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, the line-separator cases, and the lexer gate's set, which adds generated variants of
 * every source. Diagrams go in as `.mmd` fixtures under `e2e/diagrams/venn/`; text that only
 * matters to the lexer or the parser (rejections, comment forms, CRs) goes in
 * `corpus/venn-cases.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const FRONT_MATTER = /^---[\s\S]*?\n---[^\S\n]*\n/;

/** `edit` applied to the text after the front matter. */
function body(src: string, edit: (text: string) => string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  return head + edit(src.slice(head.length));
}

/** Every line break a CRLF. */
export const crlf = (src: string): string => body(src, (b) => b.replace(/\r?\n/g, '\r\n'));

/** Each indent of spaces as tabs, one per two spaces (rounded up). */
export const tabs = (src: string): string =>
  body(src, (b) => b.replace(/^ +/gm, (m) => '\t'.repeat(Math.ceil(m.length / 2))));

/**
 * Every indent removed: an indented `text` is then a plain `text` statement, which v12 parses
 * differently (or rejects), so the lexer's line-start rules see the other branch.
 */
export const dedented = (src: string): string => body(src, (b) => b.replace(/^[ \t]+/gm, ''));

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the `venn-beta` header line (pitfall 3):
 * at the middle of the line's text after its indent, moved off a surrogate pair. Lines with
 * fewer than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*venn-beta/.test(l));
    return lines
      .map((line, k) => {
        const text = line.trimStart();
        if (k <= header || text.length < 2 || text.startsWith('%%')) return line;
        let at = line.length - text.length + Math.floor(text.length / 2);
        if (/[\udc00-\udfff]/.test(line.charAt(at))) at++;
        return line.slice(0, at) + DIRECTIVE + line.slice(at);
      })
      .join('\n');
  });

const V = 'venn-beta\n';
const numbered = (prefix: string, sources: string[]): CorpusItem[] =>
  sources.map((source, k) => ({ id: `${prefix} ${k}`, source }));

/**
 * U+2028 and U+2029 (pitfall 2): `\s` (after `title`, in `rgb(…)`) and `[^\n]` (comments,
 * titles, labels, strings) take them, `[\n\r]+` and `[ \t]+` do not; v12's comment removal
 * (`^`, multiline) starts a line after them.
 */
export const LINE_SEPARATORS: CorpusItem[] = numbered('line separators', [
  V + '  set A\u2028  set B',
  'venn-beta\u2028  set A',
  'venn-beta\u2029\n  set A',
  V + '  title a\u2028b\n  set A',
  V + '  title\u2028x\n  set A',
  V + '  set A[a\u2028b]\n  set B["c\u2029d"]',
  V + '  set "a\u2029b"',
  V + '  set A\n%% c\u2028set B\n  set C',
  V + '  set A %% c\u2028set B\n  set C',
  V + '  set A%% c\u2029set B\n  set C',
  V + '  set A\n\u2028  text a',
  V + '  set A\n  text a\u2028b',
  V + '  set A\u2028%% c\n  set B',
  V + '  set A\u2029  %% c\u2028  set B\n  set C',
  V + '  set A\n  style A fill:rgb(1,\u20282,3)',
  V + '  set A:\u20281',
]);

/** The cases (`corpus/venn-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function vennCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/venn-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The venn corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function vennCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/venn'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/venn-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['dedented', dedented],
  ['mid-line directive', midLineDirective],
];

/**
 * The e2e fixtures, the v12 spec strings, the cases and the line-separator cases, and each of
 * them in every variant of {@link VARIANTS} that changes it.
 */
export async function vennGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await vennCorpus()), ...vennCases(), ...LINE_SEPARATORS];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
