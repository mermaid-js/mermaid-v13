/**
 * XY chart completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode
 * mapped to items. Keywords are offered only where the parser tests their kind: `xychart` where
 * the header goes (none above), `vertical` and `horizontal` right after it, the statements at the
 * start of a line (or after `;`) below a header, `-->` after a range's minimum and `[` after an
 * axis or plot name. Inside text values (`accTitle:`, `accDescr`, strings), comments and front
 * matter nothing is offered, and neither are names: a chart has no ids to complete.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { xychartCategories } from '../generated/categories.ts';
import { xychartDocs } from '../generated/docs.ts';
import type { XyChartDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import type { KeywordItem } from './tables.ts';
import { HEADER, ORIENTATIONS, span, STATEMENTS, tokenBefore } from './tables.ts';

/** Modes whose text is a value, not code: nothing is offered there. */
const VALUE_MODES = new Set([
  'acc_title',
  'acc_descr',
  'acc_descr_multiline',
  'string',
  'comment',
  'directive',
  'frontMatter',
]);
/** Words of text and numbers: with keywords, a cursor inside one replaces all of it. */
const REPLACED_WORD_KINDS = new Set<number>([T.Alpha, T.Num, T.Minus, T.NumberWithDecimal]);
const isWord = (kind: number) =>
  REPLACED_WORD_KINDS.has(kind) || xychartCategories[kind] === 'Keyword';

/** Items filtered by the typed prefix, one per label. */
class Items {
  readonly list: CompletionItem[] = [];
  private readonly seen = new Set<string>();

  constructor(
    readonly prefix: string,
    private readonly range: Range
  ) {}

  add(label: string, kind: CompletionKind, extra: Partial<CompletionItem> = {}): void {
    if (!label.startsWith(this.prefix) || this.seen.has(label)) return;
    this.seen.add(label);
    this.list.push({ label, kind, insertText: label, range: this.range, ...extra });
  }

  keyword(k: KeywordItem): void {
    const documentation = xychartDocs[k.kind];
    this.add(k.label, 'keyword', {
      insertText: k.insert ?? k.label,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
}

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokenBefore(tokens, o);
  if (i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0) && isWord(tokens.kind[i]!))
    end = tokens.end[i] ?? o;
  const blank = /\s/.exec(text.slice(o, end));
  if (blank) end = o + blank.index;
  return span(probe.prefix.start, end);
}

/** Whether only blanks lie between the start of the line (or the last `;`) and `at`. */
function atLineStart(text: string, at: number): boolean {
  for (let i = at - 1; i >= 0; i--) {
    const c = text.charAt(i);
    if (c === '\n' || c === '\r' || c === ';') return true;
    if (!/\s/.test(c)) return false;
  }
  return true;
}

/**
 * Statement keywords that take the blanks after their `:` or `{` (`accDescr {` up to the text,
 * all of it when the description is blank): a cursor in those blanks is in the value.
 */
const OPENERS = new Set<number>([T.AccTitle, T.AccDescr, T.AccDescrMultiline]);

/** Whether `at` is past the `:` or `{` of an `accTitle:`, `accDescr:` or `accDescr {`. */
function inOpener(text: string, tokens: TokenStream, at: number): boolean {
  const i = tokenBefore(tokens, at - 1);
  if (i < 0 || !OPENERS.has(tokens.kind[i]!)) return false;
  const start = tokens.start[i] ?? 0;
  return at <= (tokens.end[i] ?? 0) && /[:{]/.test(text.slice(start, at));
}

/**
 * Whether the lexer read a `-->` at the cursor or as the next token after it (blanks and
 * comments between): the range's arrow is already written.
 */
function arrowAfter(tokens: TokenStream, at: number): boolean {
  let i = tokenBefore(tokens, at);
  if (i >= 0 && (tokens.end[i] ?? 0) <= at) i++;
  for (i = Math.max(i, 0); i < tokens.length; i++) {
    const k = tokens.kind[i]!;
    if (k !== T.Blanks && k !== Kind.Comment && k !== Kind.Directive) break;
  }
  return tokens.kind[i] === T.ArrowDelimiter;
}

export function xyChartCompletions(
  probe: ProbeResult,
  doc: DocumentView<XyChartDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens || VALUE_MODES.has(probe.mode) || inOpener(text, tokens, probe.offset)) return [];
  const expected = new Set(probe.expected);
  if (expected.size === 0) return [];
  const range = wordRange(text, tokens, probe);
  const items = new Items(text.slice(range.start, probe.offset), range);
  const headed = result.ast.children.some((n) => n.type === 'Header' && n.range.end <= range.start);
  if (!headed && expected.has(T.XyChart)) items.keyword(HEADER);
  for (const k of ORIENTATIONS) if (expected.has(k.kind)) items.keyword(k);
  if (headed && atLineStart(text, range.start)) {
    for (const k of STATEMENTS) if (expected.has(k.kind)) items.keyword(k);
  }
  if (expected.has(T.ArrowDelimiter) && !arrowAfter(tokens, probe.offset)) {
    items.add('-->', 'operator', { documentation: xychartDocs[T.ArrowDelimiter] ?? '' });
  }
  if (expected.has(T.SquareBracesStart)) items.add('[', 'operator', { detail: 'the data' });
  return items.list;
}
