/**
 * Shared helpers of the diagram language facets (DESIGN §4.5): ranges, Markdown, the token
 * lookups and the keyword-table completer every `diagram-*` facet used to carry a copy of.
 * Pure functions; where the copies differed, the difference is a parameter.
 */
import type {
  CompletionItem,
  CompletionKind,
  Hover,
  ParseResult,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';

export const span = (start: number, end: number): Range => ({ start, end });

/** Whether `offset` is in `r`, ends included. */
export const inside = (offset: number, r: Range): boolean => r.start <= offset && offset <= r.end;

/** `r` without the blanks at its ends. */
export function trimmed(text: string, r: Range): Range {
  let { start, end } = r;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return span(start, end);
}

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** `3 nodes`, `1 node`. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

export const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The `click … href` link targets. */
export const LINK_TARGETS: readonly string[] = ['_self', '_blank', '_parent', '_top'] as const;

/** Index of the last token of `tokens` starting at or before `offset`, or -1. */
export function tokenBefore(tokens: TokenStream, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

const ASCII_BREAK = /[\n\r]/;
const UNICODE_BREAK = /[\n\r\u2028\u2029]/;

/** The text of `at`'s line before it. `unicode`: U+2028 and U+2029 end a line too. */
export function lineBefore(text: string, at: number, unicode = false): string {
  const lineBreak = unicode ? UNICODE_BREAK : ASCII_BREAK;
  let start = at;
  while (start > 0 && !lineBreak.test(text.charAt(start - 1))) start--;
  return text.slice(start, at);
}

/** Whether only spaces and tabs are between `at` and the start of its line. */
export function atLineStart(text: string, at: number): boolean {
  let i = at;
  while (i > 0 && (text.charAt(i - 1) === ' ' || text.charAt(i - 1) === '\t')) i--;
  return i === 0 || text.charAt(i - 1) === '\n' || text.charAt(i - 1) === '\r';
}

/** As {@link atLineStart} over any blank, where `opener` (`{`, `;`) starts a statement too. */
export function atStatementStart(text: string, at: number, opener: string): boolean {
  for (let i = at - 1; i >= 0; i--) {
    const c = text.charAt(i);
    if (c === '\n' || c === '\r' || c === opener) return true;
    if (!/\s/.test(c)) return false;
  }
  return true;
}

/** Whether `at` is right after `direction ` on its line. */
export function afterDirection(text: string, at: number, ignoreCase = false): boolean {
  return (ignoreCase ? /^[^\S\r\n]*direction[^\S\r\n]+$/i : /^[^\S\r\n]*direction[^\S\r\n]+$/).test(
    lineBefore(text, at)
  );
}

/**
 * The probed word's range: the prefix, plus the rest of the token the cursor is inside (when
 * `isWord` takes its kind; every kind without it), up to the first match of `stop` after the
 * cursor.
 */
export function wordRange(
  text: string,
  tokens: TokenStream | undefined,
  probe: ProbeResult,
  stop: RegExp,
  isWord?: (kind: number) => boolean
): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (
    tokens &&
    i >= 0 &&
    (tokens.start[i] ?? 0) < o &&
    o < (tokens.end[i] ?? 0) &&
    (!isWord || isWord(tokens.kind[i]!))
  )
    end = tokens.end[i] ?? o;
  const found = stop.exec(text.slice(o, end));
  if (found) end = o + found.index;
  return span(probe.prefix.start, end);
}

/** As {@link wordRange} over a run of adjoining word tokens, stopping at the first blank. */
export function wordRunRange(
  text: string,
  tokens: TokenStream,
  probe: ProbeResult,
  isWord: (kind: number) => boolean
): Range {
  const o = probe.offset;
  let end = o;
  let i = tokenBefore(tokens, o);
  if (i >= 0 && (tokens.end[i] ?? 0) <= o) i++;
  while (
    i < tokens.length &&
    (tokens.start[i] ?? 0) <= end &&
    (tokens.end[i] ?? 0) > end &&
    isWord(tokens.kind[i]!) &&
    !/\s/.test(text.charAt(end))
  ) {
    end = tokens.end[i] ?? end;
    i++;
  }
  // Some tokens take the blanks after them: the word stops at the first blank after the
  // cursor, so a range never runs on to the next line or statement.
  const blank = /\s/.exec(text.slice(o, end));
  if (blank) end = o + blank.index;
  return span(probe.prefix.start, end);
}

/** The probed word's range by characters: the prefix and every `word` character after it. */
export function wordRangeOf(text: string, probe: ProbeResult, word: RegExp): Range {
  let end = probe.offset;
  while (end < text.length && word.test(text.charAt(end))) end++;
  return span(probe.prefix.start, end);
}

/**
 * The first reason `name` cannot be a symbol name by its shape. `noun` is `An id` or
 * `A name`; `blanks` says whether no blank is allowed (`none`) or none at the ends (`ends`).
 */
export function shapeReason(
  name: string,
  noun: 'An id' | 'A name',
  blanks: 'none' | 'ends' = 'none'
): string | undefined {
  if (name === '') return `${noun} cannot be empty.`;
  if (/[\r\n]/.test(name)) return `${noun} cannot contain a line break.`;
  if (blanks === 'none' ? /\s/.test(name) : name !== name.trim())
    return blanks === 'none'
      ? `${noun} cannot contain spaces.`
      : `${noun} cannot start or end with a space.`;
  return undefined;
}

/**
 * Whether a parse read exactly one symbol of `kind`, named `name`, at `at`, and no error: the
 * read-back check of a new name written into a probe text.
 */
export function readsBack(
  result: Pick<ParseResult<unknown>, 'diagnostics' | 'symbols'>,
  at: number,
  name: string,
  kind: string
): boolean {
  const hits = result.symbols.filter((s) => s.kind === kind);
  return (
    !result.diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.name === name &&
    hits[0]!.range.start === at &&
    hits[0]!.range.end === at + name.length
  );
}

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
}

/** A {@link KeywordItem} with one short line next to its label. */
export interface DetailedKeywordItem extends KeywordItem {
  /** One short line next to the label. */
  readonly detail?: string;
}

/** A {@link KeywordItem} that says which completion kind it is. */
export interface KindedKeywordItem extends DetailedKeywordItem {
  readonly item: CompletionKind;
}

/** What {@link keywordItem} reads of a table row. */
interface KeywordRow {
  readonly label: string;
  readonly item?: CompletionKind;
  readonly insert?: string;
  readonly detail?: string;
}

/** The completion item of a keyword table row (`keyword` when the row has no `item`). */
export function keywordItem(
  k: KeywordRow,
  range: Range,
  documentation: string | undefined
): CompletionItem {
  return {
    label: k.label,
    kind: k.item ?? 'keyword',
    insertText: k.insert ?? k.label,
    range,
    ...(k.detail === undefined ? {} : { detail: k.detail }),
    ...(documentation === undefined ? {} : { documentation }),
  };
}

/**
 * The table-driven keyword completer: the rows of `table` whose kind the parser expects, whose
 * label starts with `prefix` and that `offered` (when given) lets through, in table order,
 * each with its doc from `docs`.
 */
export function keywordCompletions<K extends KeywordRow & { readonly kind: number }>(
  table: readonly K[],
  expected: ReadonlySet<number>,
  prefix: string,
  range: Range,
  docs: Readonly<Partial<Record<number, string>>>,
  offered?: (k: K) => boolean
): CompletionItem[] {
  const out: CompletionItem[] = [];
  for (const k of table) {
    if (!expected.has(k.kind) || !k.label.startsWith(prefix)) continue;
    if (offered && !offered(k)) continue;
    out.push(keywordItem(k, range, docs[k.kind]));
  }
  return out;
}

/** The items of one completion request: prefix-filtered, each label once, in the order added. */
export class CompletionList {
  readonly list: CompletionItem[] = [];
  private readonly seen = new Set<string>();

  /** `foldCase`: the prefix matches whatever its case. */
  constructor(
    readonly prefix: string,
    private readonly range: Range,
    private readonly foldCase = false
  ) {}

  add(label: string, kind: CompletionKind, extra: Partial<CompletionItem> = {}): void {
    const starts = this.foldCase
      ? label.toLowerCase().startsWith(this.prefix.toLowerCase())
      : label.startsWith(this.prefix);
    if (!starts || this.seen.has(label)) return;
    this.seen.add(label);
    this.list.push({ label, kind, insertText: label, range: this.range, ...extra });
  }

  /** A keyword table row, with its doc. */
  keyword(
    k: KeywordRow,
    documentation: string | undefined,
    kind: CompletionKind = 'keyword'
  ): void {
    this.add(k.label, kind, {
      insertText: k.insert ?? k.label,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
}

/**
 * The hover of a keyword token: its one-line doc under the keyword as written. `word` is the
 * keyword of a token that holds its statement's text too, so only the keyword is hovered.
 */
export function keywordHover(
  text: string,
  offset: number,
  token: Range,
  word: string | undefined,
  docText: string | undefined
): Hover | undefined {
  let range = token;
  if (word !== undefined) {
    const start =
      range.start + (/^[\t ]*/.exec(text.slice(range.start, range.end))?.[0].length ?? 0);
    range = span(start, start + word.length);
  }
  if (offset < range.start || offset > range.end || docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
