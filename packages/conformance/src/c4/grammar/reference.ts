/**
 * The grammar-side half of the C4 differential test: lex with the grammar's lexer, parse with
 * the reference parser built from the grammar, and project the result to an AST shape that the
 * hand-written parser's AST can be compared with. Dev and CI only.
 */
import {
  astOf,
  buildParser,
  emptyModel,
  learnDerivation,
  learnToken,
  sourceRange,
} from '@mermaid-js/gen-grammar';
import type { AstShape, ReferenceParser, SentenceModel } from '@mermaid-js/gen-grammar';
import { C4_NAME_RESERVED, C4_UNKNOWN_END, parseC4 } from '@mermaid-js/diagram-c4';
import type { C4StatementNode } from '@mermaid-js/diagram-c4';
import { preprocess } from '@mermaid-js/core/preprocess';
import { c4Grammar, grammarTokens } from './c4-grammar.ts';
import type { GrammarTokens } from '../../grammar-file.ts';

/** A comparable AST: type, source range (blanks trimmed off both ends) and children. */
export interface Shape {
  type: string;
  range: [number, number];
  children: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** Accepted, but a check beyond the syntax failed (an unknown relation end, `$__proto__`). */
  semanticError?: boolean;
  /** Statement AST shapes, nested in their boundaries, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(c4Grammar().grammar);
  return parser;
}

const trim = (src: string, start: number, end: number): [number, number] => {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(src[s] ?? '')) s++;
  while (e > s && /\s/.test(src[e - 1] ?? '')) e--;
  return [s, e];
};

/** The argument tokens of a statement's tokens `[start, end)`: `$name="value"` counts once. */
const ARGUMENTS: ReadonlySet<string> = new Set(['STR', 'STR_KEY', 'ATTRIBUTE_EMPTY']);

/**
 * A relation v12 dropped: fewer than three arguments (four for `RelIndex`, which drops its
 * first). The hand-written parser writes no AST node for it.
 */
function dropped(lexed: GrammarTokens, a: AstShape): boolean {
  if (a.type !== 'Relation') return false;
  let n = 0;
  for (let i = a.start + 1; i < a.end; i++) if (ARGUMENTS.has(lexed.tokens[i]?.name ?? '')) n++;
  return n < (lexed.tokens[a.start]?.name === 'REL_INDEX' ? 4 : 3);
}

/** Accept/reject and AST shape by the grammar (lexer + reference parser). */
export function referenceVerdict(source: string): Verdict {
  const lexed = grammarTokens(source);
  if (lexed.error !== undefined) return { accepted: false, ast: undefined };
  const tree = referenceParser().parse(lexed.tokens.map((t) => t.name));
  if (!tree) return { accepted: false, ast: undefined };
  // A range that ends where a directive was cut out maps to either side of it.
  const directives = preprocess(source).directives.map((d) => d.range);
  const toShape = (a: AstShape): Shape => {
    const text = lexed.input.text;
    let from = lexed.tokens[a.start]?.outerStart ?? 0;
    let to = lexed.tokens[a.end - 1]?.outerEnd ?? 0;
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    return {
      type: a.type,
      range: trimRemoved(source, r.start, r.end, directives),
      children: shapes(a.children),
    };
  };
  const shapes = (list: AstShape[]): Shape[] => list.filter((a) => !dropped(lexed, a)).map(toShape);
  return { accepted: true, ast: shapes(astOf(tree)) };
}

/** Errors from checks beyond the syntax: v12 threw them from its DB or its renderer. */
const SEMANTIC: ReadonlySet<string> = new Set([C4_UNKNOWN_END, C4_NAME_RESERVED]);

/**
 * Accept/reject and AST shape by the hand-written parser. Preprocess diagnostics are left out
 * (an unclosed directive): the grammar reads the text after v12's preprocessing.
 */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseC4(source, { preprocessed: pre });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  const directives = pre.directives.map((d) => d.range);
  const shapes = (list: readonly C4StatementNode[]): Shape[] =>
    list.map((s) => ({
      type: s.type,
      range: trimRemoved(source, s.range.start, s.range.end, directives),
      children: s.type === 'Boundary' ? shapes(s.children) : [],
    }));
  return { accepted: true, semanticError: errors.length > 0, ast: shapes(result.ast.children) };
}

/**
 * {@link trim}, also past directives at either end: a token's range covers the removed spans
 * it runs over, the grammar's text has none.
 */
function trimRemoved(
  src: string,
  start: number,
  end: number,
  removed: readonly { start: number; end: number }[]
): [number, number] {
  let [s, e] = trim(src, start, end);
  for (let moved = true; moved; ) {
    moved = false;
    for (const r of removed) {
      if (r.end === e && r.start >= s) [s, e] = trim(src, s, r.start);
      else if (r.start === s && r.end <= e) [s, e] = trim(src, r.end, e);
      else continue;
      moved = true;
    }
  }
  return [s, e];
}

/** A sentence model learnt from corpus sources the grammar accepts. */
export function learnSentenceModel(sources: readonly string[]): SentenceModel {
  const model = emptyModel(referenceParser());
  for (const source of sources) {
    const lexed = grammarTokens(source);
    if (lexed.error !== undefined) continue;
    const tree = referenceParser().parse(lexed.tokens.map((t) => t.name));
    if (!tree) continue;
    learnDerivation(model, tree);
    let prev = '';
    let prevEnd = 0;
    for (const t of lexed.tokens) {
      const r = sourceRange(lexed.input, prevEnd, t.outerEnd);
      learnToken(model, prev, t.name, source.slice(r.start, r.end));
      prev = t.name;
      prevEnd = t.outerEnd;
    }
  }
  return model;
}

/**
 * Whether mermaid\@12 accepted the syntax: true when it accepted, false on a jison parse or
 * lexical error, undefined when it stopped for another reason (an unknown relation end, which
 * the oracle checks as v12's renderer did; `setDirection is not a function`; the `TypeError` of
 * `$__proto__`), which can hide a later syntax error.
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Parse error|Lexical error|Expecting /.test(result.error ?? '') ? false : undefined;
}
