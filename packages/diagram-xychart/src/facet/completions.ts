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
import { wordRange } from '@mermaid-js/core/parser-kit/facet';
import { atStatementStart as atLineStart } from '@mermaid-js/core/parser-kit/facet';
import { CompletionList as Items } from '@mermaid-js/core/parser-kit/facet';

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
  const range = wordRange(text, tokens, probe, /\s/, isWord);
  const items = new Items(text.slice(range.start, probe.offset), range);
  const headed = result.ast.children.some((n) => n.type === 'Header' && n.range.end <= range.start);
  if (!headed && expected.has(T.XyChart)) items.keyword(HEADER, xychartDocs[HEADER.kind]);
  for (const k of ORIENTATIONS) if (expected.has(k.kind)) items.keyword(k, xychartDocs[k.kind]);
  if (headed && atLineStart(text, range.start, ';')) {
    for (const k of STATEMENTS) if (expected.has(k.kind)) items.keyword(k, xychartDocs[k.kind]);
  }
  if (expected.has(T.ArrowDelimiter) && !arrowAfter(tokens, probe.offset)) {
    items.add('-->', 'operator', { documentation: xychartDocs[T.ArrowDelimiter] ?? '' });
  }
  if (expected.has(T.SquareBracesStart)) items.add('[', 'operator', { detail: 'the data' });
  return items.list;
}
