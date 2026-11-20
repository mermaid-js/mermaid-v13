/**
 * Railroad completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items,
 * in the notation the text is in. An item is offered only when the parser tests its kind at the
 * cursor: the four headers at the start; `title`, `accTitle` and `accDescr` as the first word of
 * a line after the header; IR's call keywords where an expression goes; the notation's
 * operators where one may follow. The rules already defined are offered where an element goes:
 * by name in EBNF, ABNF and PEG, as `nonterminal("name")` in IR, and by name inside the quotes
 * of IR's `nonterminal("…")`. Nothing is offered in other strings, in a statement's text or
 * outside code.
 */
import { isSpace, Kind } from '@mermaid-js/core/parser-kit';
import type { CompletionItem, DocumentView, ProbeResult, Range } from '@mermaid-js/core/parser-kit';
import type { RailroadDocument } from '../parser/ast.ts';
import { RAILROAD_HEADERS } from '../parser/detect.ts';
import { T } from '../parser/tokens.ts';
import type { RailroadNotation } from '../parser/tokens.ts';
import {
  atLineStart,
  keywordCompletions,
  span,
  statementKeyword,
  tokenBefore,
  wordRange,
} from '@mermaid-js/shared/parser/facet';
import type { TypedKeywordItem } from '@mermaid-js/shared/parser/facet';
import {
  block,
  NOTATION_DOCS,
  notationOf,
  ruleDefinitions,
  ruleFirstLine,
  isTrivia,
} from './tables.ts';

/** An item offered when the parser expects `kind`. */
interface Item extends TypedKeywordItem {
  /** Offered only as the first word of its line (the header statements). */
  readonly lineStart?: true;
}

const op = (kind: number, label: string, detail?: string): Item => ({
  kind,
  label,
  item: 'operator',
  ...(detail === undefined ? {} : { detail }),
});
const call = (kind: number, label: string): Item => ({
  kind,
  label,
  item: 'keyword',
  insert: `${label}(`,
});

/** Items every notation has: the header statements. */
const STATEMENTS: readonly Item[] = [
  statementKeyword(T.Title, 'title'),
  statementKeyword(T.AccTitle, 'accTitle', 'accTitle: '),
  // `accDescr` takes one line or a block: both forms are offered.
  statementKeyword(T.AccDescr, 'accDescr:', 'accDescr: '),
  statementKeyword(T.AccDescr, 'accDescr {', 'accDescr { }'),
];

/** Each notation's own items, in the order they are offered. */
const ITEMS: Readonly<Record<RailroadNotation, readonly Item[]>> = {
  railroad: [
    call(T.KwSequence, 'sequence'),
    call(T.KwChoice, 'choice'),
    call(T.KwOptional, 'optional'),
    call(T.KwOneOrMore, 'oneOrMore'),
    call(T.KwZeroOrMore, 'zeroOrMore'),
    call(T.KwTerminal, 'terminal'),
    call(T.KwNonterminal, 'nonterminal'),
    call(T.KwSpecial, 'special'),
    op(T.Equals, '='),
    op(T.Comma, ','),
    op(T.Semi, ';'),
  ],
  railroadEbnf: [
    op(T.Equals, '='),
    op(T.Define, '::='),
    op(T.Pipe, '|'),
    op(T.Comma, ','),
    op(T.Question, '?'),
    op(T.Star, '*'),
    op(T.Plus, '+'),
    op(T.Minus, '-'),
    op(T.Semi, ';'),
  ],
  railroadAbnf: [
    op(T.Equals, '='),
    op(T.Slash, '/'),
    op(T.Repeat, '*', 'any number of times'),
    op(T.Repeat, '1*', 'once or more'),
    op(T.Semi, ';'),
  ],
  railroadPeg: [
    op(T.Arrow, '<-'),
    op(T.Slash, '/'),
    op(T.Amp, '&'),
    op(T.Bang, '!'),
    op(T.Question, '?'),
    op(T.Star, '*'),
    op(T.Plus, '+'),
    op(T.Dot, '.'),
    op(T.Semi, ';'),
  ],
};

/** A word stops at the first blank, quote or punctuation after the cursor. */
const WORD_STOP = /[^\w-]/;

/** The defined rules whose name starts with `prefix`, as items written by `write`. */
function ruleItems(
  doc: DocumentView<RailroadDocument>,
  prefix: string,
  range: Range,
  write: (name: string) => string
): CompletionItem[] {
  const out: CompletionItem[] = [];
  for (const [name, [first]] of ruleDefinitions(doc.text, doc.result)) {
    if (!first || !name.startsWith(prefix)) continue;
    const line = ruleFirstLine(doc.text, first).trim();
    out.push({
      label: name,
      kind: 'node',
      insertText: write(name),
      range,
      detail: 'rule',
      documentation: block(line),
    });
  }
  return out;
}

/**
 * Inside the quotes of IR's `nonterminal("…")`: the rule names, replacing the name typed so far
 * (up to the closing quote).
 */
function irReferenceItems(
  probe: ProbeResult,
  doc: DocumentView<RailroadDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const o = probe.offset;
  const j = tokenBefore(tokens, o - 1);
  const start = tokens.start[j] ?? 0;
  const kind = tokens.kind[j];
  if (j < 0 || (kind !== T.String && kind !== Kind.Error) || o <= start) return [];
  // The call before it: `nonterminal` `(`, blanks and comments between them aside.
  const before: number[] = [];
  for (let k = j - 1; k >= 0 && before.length < 2; k--) {
    const kk = tokens.kind[k] ?? Kind.EOF;
    if (!isTrivia(kk)) before.push(kk);
  }
  if (before[0] !== T.LParen || before[1] !== T.KwNonterminal) return [];
  const name = /^[\w-]*/.exec(text.slice(o))?.[0] ?? '';
  const range = span(start + 1, o + name.length);
  return ruleItems(doc, text.slice(start + 1, o), range, (n) => n);
}

export function railroadCompletions(
  probe: ProbeResult,
  doc: DocumentView<RailroadDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const notation = notationOf(result.model);
  if (probe.mode === 'string' && notation === 'railroad') return irReferenceItems(probe, doc);
  if (probe.mode !== 'INITIAL') return [];
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe, WORD_STOP);
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start, isSpace);
  const docs = NOTATION_DOCS[notation];
  const out: CompletionItem[] = [];
  const offer = (table: readonly Item[], tableDocs = docs) =>
    out.push(
      ...keywordCompletions(
        table,
        expected,
        prefix,
        range,
        tableDocs,
        (k) => !k.lineStart || lineStart
      )
    );
  // Any of the four headers, each with its notation's doc: the text may be on its way to
  // another notation.
  for (const [n, header] of RAILROAD_HEADERS)
    offer([{ kind: T.Header, label: header, item: 'keyword' }], NOTATION_DOCS[n]);
  // Where the header goes, only the header: the parser reads on past a missing one, but
  // nothing else may come first.
  if (expected.has(T.Header)) return out;
  offer(STATEMENTS);
  offer(ITEMS[notation]);
  if (notation === 'railroad' && expected.has(T.KwNonterminal)) {
    out.push(...ruleItems(doc, prefix, range, (n) => `nonterminal("${n}")`));
  } else if (expected.has(T.Id) && expected.has(T.String)) {
    out.push(...ruleItems(doc, prefix, range, (n) => n));
  }
  return out;
}
