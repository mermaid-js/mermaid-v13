// cspell:words xychart
/**
 * The XY chart corpora (#507): the e2e fixtures and the strings harvested from v12's
 * `xychart.jison.spec.ts` and syntax page (`corpus/xychart-v12-specs.json`), the lexer and
 * parser cases of `corpus/xychart-cases.json` (the spec's quirks, line-separator and CR cases),
 * and the lexer gate's set, which adds generated variants of every source ({@link XYCHART_VARIANTS}).
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import { parseXyChart, xyChartTokens, XyChartTokenKind as T } from '@mermaid-js/diagram-xychart';
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import {
  body,
  crlf,
  DIRECTIVE,
  FRONT_MATTER,
  gateVariants,
  withVariants,
} from '../gate-variants.ts';
import type { Variant } from '../gate-variants.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

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

/**
 * A directive through the middle of every line after the header line (pitfall 3's mid-line
 * cut): at the middle of the line's text after its indent, moved off a surrogate pair. Lines
 * with fewer than two characters of text and `%%` lines are left as they are, and so is a
 * source without a header line (the shared `midLineDirective` cuts every line of that).
 */
const midLineDirective = (src: string): string =>
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
export const XYCHART_VARIANTS: readonly Variant[] = [
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
export const xyChartRecovery = (): XyChartRecoveryCase[] =>
  corpusJson<XyChartRecoveryCase>('xychart-recovery.json');

/**
 * The cases (`corpus/xychart-cases.json`: each quirk, rejection and line-break form) and the
 * parser's recovery set.
 */
export function xyChartCases(): CorpusItem[] {
  const recovery = xyChartRecovery().map(({ id, source }) => ({ id, source }));
  return [...corpusJson('xychart-cases.json'), ...recovery];
}

/** The e2e fixtures and the v12 spec and syntax-page strings. */
export const xyChartCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('xychart');

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link XYCHART_VARIANTS} that changes it.
 */
export async function xyChartGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await xyChartCorpus()), ...xyChartCases()], XYCHART_VARIANTS);
}

/**
 * Whether core's preprocess finds an unclosed `%%{` in `source`. v12's directive regex cut such
 * a directive (with the rest of the text, or up to a word argument's end), so v12 reads less
 * text; v13 rejects it. The cases that have one are listed divergences (`divergences/`), as
 * for quadrant and radar; their generated variants are left out of the parity corpus, since
 * they only repeat that divergence. Nothing else is left out (the grammar gates compare these
 * too: both sides lex the text v12 cut).
 */
const unclosedDirective = (source: string): boolean =>
  preprocess(source).diagnostics.some((d) => d.code === 'UNCLOSED_DIRECTIVE');

/** jison's `alphaNumToken`s: the words of unquoted text. */
const WORDS = new Set<number>([
  T.Alpha,
  T.Num,
  T.Plus,
  T.Equals,
  T.Mult,
  T.Dot,
  T.Brkt,
  T.Minus,
  T.Underscore,
  T.Amp,
]);
/**
 * What may lie between two words of one unquoted text: blanks, an empty string's quotes and the
 * dead markdown rule's text (jison returns no token for either).
 */
const BETWEEN_WORDS = new Set<number>([T.Blanks, T.StringStart, T.StringEnd, T.DeadMdRule]);

/**
 * Whether v13 accepts `source` and it has unquoted text whose words blanks separate: v13 reads
 * one space there where mermaid 12.2.0 read none (#683, v12's fix mermaid-js/mermaid#8575), so
 * `title Sales Report` is `Sales Report` to v13 and `SalesReport` to v12. The sources with such
 * text are listed divergences (`divergences/xychart.json`); their generated variants and
 * statement orders are left out of the parity corpus, and the sources out of the gates that
 * compare v12's texts (layout parity, the service's symbols), since they only repeat that
 * divergence.
 */
export function spacedWords(source: string): boolean {
  if (parseXyChart(source).diagnostics.some((d) => d.severity === 'error')) return false;
  let word = false;
  let blank = false;
  for (const t of xyChartTokens(source)) {
    if (WORDS.has(t.kind)) {
      if (word && blank) return true;
      word = true;
      blank = false;
    } else if (BETWEEN_WORDS.has(t.kind)) blank ||= t.kind === T.Blanks;
    else word = blank = false;
  }
  return false;
}

/**
 * The generated variants for model parity (#508): every item of {@link xyChartGateCorpus} the
 * parity suite's corpus dirs and files do not list already, with ids `xychart-gate/<id>`, and
 * the statement orders of {@link xyChartOrderCorpus}; none with an unclosed directive, nor with
 * {@link spacedWords}.
 */
export async function xyChartParityCorpus(): Promise<CorpusItem[]> {
  const listed = [...(await xyChartCorpus()), ...xyChartCases()];
  const gate = gateVariants(await xyChartGateCorpus(), listed, 'xychart');
  return [...gate, ...(await xyChartOrderCorpus())].filter(
    (item) => !unclosedDirective(item.source) && !spacedWords(item.source)
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
