/**
 * The grammar-side half of the block differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape that
 * the hand-written parser's AST can be compared with. Dev and CI only.
 */
import {
  astOf,
  buildParser,
  emptyModel,
  learnDerivation,
  learnToken,
  sourceRange,
} from '@mermaid-js/gen-grammar';
import type { AstShape, LexToken, ReferenceParser, SentenceModel } from '@mermaid-js/gen-grammar';
import { parseBlock } from '@mermaid-js/diagram-block';
import type { BlockStatementNode } from '@mermaid-js/diagram-block';
import { isLimitCode } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { blockGrammar, grammarTokens } from './block-grammar.ts';

/** A comparable AST: statement type, source range (blanks trimmed off both ends), children. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** The AST shapes, nested as composites nest, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(blockGrammar().grammar);
  return parser;
}

/**
 * `[start, end)` without blanks at either end, nor a `;` at the end: v12's preprocessing drops
 * the last `;` of a `style` line, which the grammar's input does not hold and the hand-written
 * lexer counts to the token before it.
 */
const trim = (src: string, start: number, end: number): [number, number] => {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(src[s] ?? '')) s++;
  while (e > s && /[\s;]/.test(src[e - 1] ?? '')) e--;
  return [s, e];
};

/** Accept/reject and AST shape by the grammar (lexer + reference parser). */
export function referenceVerdict(source: string): Verdict {
  const lexed = grammarTokens(source);
  if (lexed.error !== undefined) return { accepted: false, ast: undefined };
  const { tokens } = lexed;
  const tree = referenceParser().parse(tokens.map((t) => t.name));
  if (!tree) return { accepted: false, ast: undefined };
  const text = lexed.input.text;
  const toShape = (a: AstShape): Shape => {
    let from = tokens[a.start]?.outerStart ?? 0;
    let to = tokens[a.end - 1]?.outerEnd ?? 0;
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    // A character's mapped range runs over a span removed right after it (a directive after
    // the statement); the statement ends one past where its last character starts.
    // Text that replaced a run (an entity placeholder: each of its characters starts where the
    // run does) ends where the run does.
    const last = lexed.input.from[to - 1];
    const replaced = to >= 2 && lexed.input.from[to - 2] === last;
    const end = last === undefined || replaced ? r.end : Math.min(r.end, last + 1);
    const shape: Shape = { type: a.type, range: trim(source, r.start, end) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

function handShape(source: string, n: BlockStatementNode): Shape {
  const shape: Shape = { type: n.type, range: trim(source, n.range.start, n.range.end) };
  if (n.type === 'Composite' && n.children.length > 0)
    shape.children = n.children.map((c) => handShape(source, c));
  return shape;
}

/**
 * Accept/reject (syntax only, as the grammar sees it: warnings and limits aside) and AST shape
 * by the hand-written parser.
 */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseBlock(source, { preprocessed: pre });
  const errors = [...pre.diagnostics, ...result.diagnostics].filter(
    (d) => d.severity === 'error' && !isLimitCode(d.code)
  );
  if (errors.length > 0) return { accepted: false, ast: undefined };
  return { accepted: true, ast: result.ast.children.map((n) => handShape(source, n)) };
}

/** A sentence model learnt from corpus sources the grammar accepts. */
export function learnSentenceModel(sources: readonly string[]): SentenceModel {
  const model = emptyModel(referenceParser());
  for (const source of sources) {
    const lexed = grammarTokens(source);
    if (lexed.error !== undefined) continue;
    const tokens: LexToken[] = lexed.tokens;
    const tree = referenceParser().parse(tokens.map((t) => t.name));
    if (!tree) continue;
    learnDerivation(model, tree);
    let prev = '';
    let prevEnd = 0;
    for (const t of tokens) {
      const r = sourceRange(lexed.input, prevEnd, t.outerEnd);
      learnToken(model, prev, t.name, source.slice(r.start, r.end));
      prev = t.name;
      prevEnd = t.outerEnd;
    }
  }
  return model;
}

/**
 * Whether mermaid\@12 accepted the syntax: false on a jison lexer or parse error, undefined
 * when it rejected for another reason (its DB's TypeError on `style`, or it did not detect the
 * source as block).
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Lexical error|Parse error/.test(result.error ?? '') ? false : undefined;
}
