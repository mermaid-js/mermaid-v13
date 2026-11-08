// cspell:words xychart
/**
 * The XY chart corpora (#507): the e2e fixtures and the strings harvested from v12's
 * `xychart.jison.spec.ts` and syntax page (`corpus/xychart-v12-specs.json`), the lexer and
 * parser cases of `corpus/xychart-cases.json` (the spec's quirks, line-separator and CR cases),
 * and the lexer gate's set, which adds generated variants of every source ({@link VARIANTS}).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preprocess } from '@mermaid-js/core/preprocess';
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

/**
 * Every line break after the header line preceded by `sep` (U+2028 or U+2029: `\s`, but not
 * `\n`, and the end of a regex `.`).
 */
const separated =
  (sep: string) =>
  (src: string): string =>
    body(src, (b) => {
      const nl = b.indexOf('\n');
      return nl < 0 ? b : b.slice(0, nl + 1) + b.slice(nl + 1).replace(/\n/g, sep + '\n');
    });

/** Every line break after the header line preceded by U+2028. */
export const lineSeparators = separated('\u2028');

/** Every line break after the header line preceded by U+2029. */
export const paragraphSeparators = separated('\u2029');

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
  ['paragraph separators', paragraphSeparators],
  ['mid-line directive', midLineDirective],
];

/** One case of the parser's recovery set (`corpus/xychart-recovery.json`, #508). */
export interface XyChartRecoveryCase extends CorpusItem {
  name: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Plot names and categories that must still be in the model. */
  keeps?: string[];
}

/** The recovery set, whose expected diagnostics `recovery.spec.ts` checks. */
export function xyChartRecovery(): XyChartRecoveryCase[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/xychart-recovery.json'), 'utf8')
  ) as XyChartRecoveryCase[];
}

/**
 * The cases (`corpus/xychart-cases.json`: each quirk, rejection and line-break form) and the
 * parser's recovery set.
 */
export function xyChartCases(): CorpusItem[] {
  const cases = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/xychart-cases.json'), 'utf8')
  ) as CorpusItem[];
  return [...cases, ...xyChartRecovery().map(({ id, source }) => ({ id, source }))];
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

/**
 * Whether core's preprocess finds an unclosed `%%{` in `source`. v12's directive regex cut such
 * a directive (with the rest of the text, or up to a word argument's end), so v12 reads less
 * text; v13 rejects it. The cases that have one are listed divergences (`divergences.json`), as
 * for quadrant and radar; their generated variants are left out of the parity corpus, since
 * they only repeat that divergence. Nothing else is left out (the grammar gates compare these
 * too: both sides lex the text v12 cut).
 */
const unclosedDirective = (source: string): boolean =>
  preprocess(source).diagnostics.some((d) => d.code === 'UNCLOSED_DIRECTIVE');

/**
 * The generated variants for model parity (#508): every item of {@link xyChartGateCorpus} the
 * parity suite's corpus dirs and files do not list already, with ids `xychart-gate/<id>`, and
 * the statement orders of {@link xyChartOrderCorpus}; none with an unclosed directive.
 */
export async function xyChartParityCorpus(): Promise<CorpusItem[]> {
  const listed = new Set([...(await xyChartCorpus()), ...xyChartCases()].map((c) => c.id));
  const gate = (await xyChartGateCorpus())
    .filter((item) => !listed.has(item.id))
    .map((item) => ({ id: `xychart-gate/${item.id}`, source: item.source }));
  return [...gate, ...(await xyChartOrderCorpus())].filter(
    (item) => !unclosedDirective(item.source)
  );
}

/** Sources with at most this many statement lines get every order of them. */
const ALL_ORDERS = 4;

/** Every order of `items` (`items.length` ≤ {@link ALL_ORDERS}). */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
  );
}

/**
 * The orders of `lines` to try: every one for up to {@link ALL_ORDERS} lines; else the reverse,
 * each rotation, and each line moved to the front and to the back. Each statement in turn comes
 * first and last, so every axis and plot is read before and after every other kind.
 */
function orders<T>(lines: readonly T[]): T[][] {
  if (lines.length <= ALL_ORDERS) return permutations(lines);
  const n = lines.length;
  const out = [[...lines].reverse()];
  for (let k = 1; k < n; k++) out.push([...lines.slice(k), ...lines.slice(0, k)]);
  for (let k = 0; k < n; k++) {
    const rest = [...lines.slice(0, k), ...lines.slice(k + 1)];
    const line = lines[k] as T;
    out.push([line, ...rest], [...rest, line]);
  }
  return out;
}

/**
 * Model parity over every statement order (#508): the corpus and the cases with their statement
 * lines (the lines after the header line, blank and `%%` lines left where they are) reordered as
 * {@link orders} says. Ids are `xychart-order/<id> (<order>)`, the order as the original line
 * numbers. v12's DB and v13's model must agree on each, so the order-dependent rules (the x
 * range from the first plot, a plot before its axis, the y range from the plots read before a
 * `y-axis`, the last title) are compared in every order, not only as written.
 */
export async function xyChartOrderCorpus(): Promise<CorpusItem[]> {
  const out: CorpusItem[] = [];
  const seen = new Set<string>();
  for (const item of [...(await xyChartCorpus()), ...xyChartCases()]) {
    const head = FRONT_MATTER.exec(item.source)?.[0] ?? '';
    const lines = item.source.slice(head.length).split('\n');
    const header = lines.findIndex((l) => /^\s*xychart/.test(l));
    if (header < 0) continue;
    const slots: number[] = [];
    lines.forEach((l, k) => {
      if (k > header && l.trim() !== '' && !l.trim().startsWith('%%')) slots.push(k);
    });
    if (slots.length < 2) continue;
    for (const order of orders(slots)) {
      if (order.every((k, i) => k === slots[i])) continue;
      const next = [...lines];
      slots.forEach((slot, i) => (next[slot] = lines[order[i] as number] as string));
      const source = head + next.join('\n');
      if (seen.has(source)) continue;
      seen.add(source);
      out.push({ id: `xychart-order/${item.id} (${order.join(' ')})`, source });
    }
  }
  return out;
}
