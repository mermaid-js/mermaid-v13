/**
 * Completion pieces of the indentation-tree diagrams' language facets (DESIGN §4.5, R-LANG-7):
 * kanban and mindmap, whose lexer is `parser/tree`. Where the two differ, the difference is a
 * parameter (D557).
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  ProbeResult,
  Range,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { lineBefore, span } from './facet.ts';

const BLANK = /^[\t ]*$/;
/** A class word's end: the blanks a `:::` line is split at. */
const CLASS_BLANK = /[\t\n\f\r ]/;

/**
 * The index of the last token of `kinds` in `tokens` that holds `at` (starts at or before it,
 * ends at or after it), or -1.
 */
export function tokenAt(tokens: TokenStream, at: number, kinds: readonly number[]): number {
  let found = -1;
  for (let j = 0; j < tokens.length; j++) {
    if ((tokens.start[j] ?? 0) > at) break;
    if (at <= (tokens.end[j] ?? 0) && kinds.includes(tokens.kind[j] ?? Kind.EOF)) found = j;
  }
  return found;
}

/**
 * The names of `kind` among `symbols`, first use first, but not those inside `line` other than
 * the one at `word` (the one an item may replace).
 */
export function namesOutside(
  symbols: readonly SymbolOccurrence[],
  kind: string,
  line: Range,
  word: Range
): string[] {
  const out = new Set<string>();
  const taken = new Set<string>();
  for (const s of symbols) {
    if (s.kind !== kind) continue;
    const inLine = line.start <= s.range.start && s.range.end <= line.end;
    const atCursor = s.range.start === word.start && s.range.end === word.end;
    if (inLine && !atCursor) taken.add(s.name);
    else if (!inLine) out.add(s.name);
  }
  return [...out].filter((name) => !taken.has(name));
}

/** The token kinds of a `:::` class list. */
export interface ClassKinds {
  /** `:::` */
  readonly start: number;
  /** The class names after it. */
  readonly names: number;
}

/**
 * The class names for the word at the cursor in a `:::` line (those the diagram uses
 * elsewhere), or undefined when the cursor is not in one.
 */
export function classItems(
  text: string,
  tokens: TokenStream,
  symbols: readonly SymbolOccurrence[],
  at: number,
  kinds: ClassKinds
): CompletionItem[] | undefined {
  const j = tokenAt(tokens, at, [kinds.names, kinds.start]);
  if (j < 0) return undefined;
  const start = tokens.start[j] ?? 0;
  const end = tokens.end[j] ?? 0;
  // `:::` itself: the cursor is in it, not after it.
  if (tokens.kind[j] === kinds.start && at < end) return undefined;
  let from = at;
  while (from > start && !CLASS_BLANK.test(text.charAt(from - 1))) from--;
  let to = at;
  while (to < end && !CLASS_BLANK.test(text.charAt(to))) to++;
  if (tokens.kind[j] === kinds.start) from = to = at;
  const prefix = text.slice(from, at);
  const range = span(from, to);
  return namesOutside(symbols, 'class', span(start, end), range)
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ label: name, kind: 'class', insertText: name, range }));
}

/** The word a statement starts with: what is typed of it, and the range an item replaces. */
export interface StartWord {
  readonly prefix: string;
  readonly range: Range;
}

/**
 * The word at the cursor when only the indent is before it on its line, or undefined. With a
 * prefix, the rest of the word (the run of `word` after the cursor) is replaced too.
 */
export function statementStartWord(
  text: string,
  probe: ProbeResult,
  word: RegExp
): StartWord | undefined {
  const { offset } = probe;
  const start = probe.prefix.start;
  const prefix = text.slice(start, offset);
  if (!BLANK.test(lineBefore(text, start, true)) || /[\n\r]/.test(prefix)) return undefined;
  const rest = word.exec(text.slice(offset))?.[0] ?? '';
  return { prefix, range: span(start, prefix === '' ? offset : offset + rest.length) };
}

/** The token kinds of the keywords at an outline statement start. */
export interface OutlineKinds {
  /** The header keyword and its label (`kanban`, `mindmap`). */
  readonly header: readonly [kind: number, label: string];
  /** What a node starts with. */
  readonly nodeId: number;
  /** `::icon(` and `:::`. */
  readonly iconStart: number;
  readonly classStart: number;
}

/**
 * The keywords at an outline statement start, labels matched whatever their case: the header
 * where the parser expects it; else, where a node may go and one is written above (`afterNode`),
 * its decorations `::icon()` and `:::`.
 */
export function outlineKeywords(
  at: StartWord,
  expected: ReadonlySet<number>,
  kinds: OutlineKinds,
  docs: Readonly<Partial<Record<number, string>>>,
  afterNode: boolean
): CompletionItem[] {
  const lower = at.prefix.toLowerCase();
  const out: CompletionItem[] = [];
  const keyword = (label: string, kind: number, item: 'keyword' | 'operator') => {
    if (!label.toLowerCase().startsWith(lower)) return;
    const documentation = docs[kind];
    out.push({
      label,
      kind: item,
      insertText: label,
      range: at.range,
      ...(documentation === undefined ? {} : { documentation }),
    });
  };
  const [header, label] = kinds.header;
  if (expected.has(header)) keyword(label, header, 'keyword');
  else if (expected.has(kinds.nodeId) && afterNode) {
    keyword('::icon()', kinds.iconStart, 'operator');
    keyword(':::', kinds.classStart, 'operator');
  }
  return out;
}
