/**
 * The C4 corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, and the lexer gate's set, which adds generated variants of every source.
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
 * A U+2028 before every line break after the header line, and a U+2029 after the first blank
 * of each line: `\s` takes both, a regex `.` and `[^\n]` do not stop at the second one the
 * same way (pitfall 3).
 */
export const lineSeparators = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*C4/.test(l));
    return lines.map((line, k) => (k <= header ? line : line.replace(' ', '  ') + ' ')).join('\n');
  });

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the header line (pitfall 3): at the
 * middle of the line's text after its indent, moved off a surrogate pair. Lines with fewer
 * than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*C4/.test(l));
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

/** The cases (`corpus/c4-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function c4Cases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/c4-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The C4 corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function c4Corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/c4'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/c4-v12-specs.json'), 'utf8')
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
  ['line separators', lineSeparators],
  ['mid-line directive', midLineDirective],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function c4GateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await c4Corpus()), ...c4Cases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
