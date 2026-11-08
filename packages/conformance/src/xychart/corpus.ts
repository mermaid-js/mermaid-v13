// cspell:words xychart
/**
 * The XY chart corpora (#507): the e2e fixtures and the strings harvested from v12's
 * `xychart.jison.spec.ts` and syntax page (`corpus/xychart-v12-specs.json`), the lexer and
 * parser cases of `corpus/xychart-cases.json` (the spec's quirks, line-separator and CR cases),
 * and the lexer gate's set, which adds generated variants of every source ({@link VARIANTS}).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const FRONT_MATTER = /^---[\s\S]*?\n---[^\S\n]*\n/;

/** `edit` applied to the text after the front matter. */
function body(src: string, edit: (text: string) => string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  return head + edit(src.slice(head.length));
}

/**
 * `src` with nine comment lines after every line of the body; for a body of one or two lines,
 * one comment line through the middle of the second line, or before a one-line body. The header
 * line is never cut, so v12 still detects the chart. v12 removed the comment lines before
 * lexing, so tokens must match across them (pitfall 3).
 */
export const commented = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    if (lines.length > 2) return lines.join('\n' + '  %% c\n'.repeat(9));
    const nl = b.indexOf('\n');
    if (nl < 0) return '%% cut\n' + b;
    const mid = nl + 1 + Math.floor((b.length - nl - 1) / 2);
    return b.slice(0, mid) + '\n%% cut\n' + b.slice(mid);
  });

/** Every line break a CRLF. */
export const crlf = (src: string): string => body(src, (b) => b.replace(/\r?\n/g, '\r\n'));

/** Every line break after the header line preceded by U+2028 (`\s`, but not `\n`). */
export const lineSeparators = (src: string): string =>
  body(src, (b) => {
    const nl = b.indexOf('\n');
    return nl < 0 ? b : b.slice(0, nl + 1) + b.slice(nl + 1).replace(/\n/g, ' \n');
  });

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the header line (pitfall 3's mid-line
 * cut): at the middle of the line's text after its indent, moved off a surrogate pair. Lines
 * with fewer than two characters of text and `%%` lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*xychart/i.test(l));
    return lines
      .map((line, k) => {
        const text = line.trimStart();
        if (header < 0 || k <= header || text.length < 2 || text.startsWith('%%')) return line;
        let at = line.length - text.length + Math.floor(text.length / 2);
        if (/[\udc00-\udfff]/.test(line.charAt(at))) at++;
        return line.slice(0, at) + DIRECTIVE + line.slice(at);
      })
      .join('\n');
  });

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['line separators', lineSeparators],
  ['mid-line directive', midLineDirective],
];

/** The cases (`corpus/xychart-cases.json`): each quirk, rejection and line-break form. */
export function xyChartCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/xychart-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The e2e fixtures and the v12 spec and syntax-page strings. */
export async function xyChartCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/xychart'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/xychart-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function xyChartGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await xyChartCorpus()), ...xyChartCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
