/**
 * The grammar-side half of the c4-beta differential test (R-PARSE-9): lex with the grammar's
 * lexer, parse with the reference parser built from the grammar, and project the result to an
 * AST shape that the hand-written parser's AST can be compared with. Dev and CI only.
 */
import {
  astOf,
  buildParser,
  emptyModel,
  learnDerivation,
  learnToken,
} from '@mermaid-js/gen-grammar';
import type { AstShape, LexToken, ReferenceParser, SentenceModel } from '@mermaid-js/gen-grammar';
import { parseC4Beta } from '@mermaid-js/diagram-c4/testing';
import type { C4BetaStatementNode } from '@mermaid-js/diagram-c4/testing';
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import { c4betaGrammar, grammarTokens, parserTokens } from './c4beta-grammar.ts';

/** A comparable AST: type, source range (blanks trimmed off both ends) and nested nodes. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** Statement-level AST shapes (a body's elements nested), when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(c4betaGrammar().grammar);
  return parser;
}

const trim = (src: string, start: number, end: number): [number, number] => {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(src[s] ?? '')) s++;
  while (e > s && /\s/.test(src[e - 1] ?? '')) e--;
  return [s, e];
};

/** Accept/reject and AST shape by the grammar (lexer + reference parser). */
export function referenceVerdict(source: string): Verdict {
  const lexed = grammarTokens(source);
  if (lexed.error !== undefined) return { accepted: false, ast: undefined };
  const tokens = parserTokens(lexed);
  const tree = referenceParser().parse(tokens.map((t) => t.name));
  if (!tree) return { accepted: false, ast: undefined };
  const toShape = (a: AstShape): Shape => {
    const from = tokens[a.start]?.start ?? 0;
    const to = tokens[a.end - 1]?.end ?? 0;
    const shape: Shape = { type: a.type, range: trim(source, from, to) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** What the grammar cannot say: the errors that come from the model, not the syntax. */
const SEMANTIC = new Set(['C4BETA_DUPLICATE_ID', 'C4_UNKNOWN_END', ...Object.values(LIMIT_CODES)]);

/** Accept/reject and AST shape by the hand-written parser, apart from the semantic errors. */
export function handWrittenVerdict(source: string): Verdict {
  const result = parseC4Beta(source);
  const syntax = result.diagnostics.filter((d) => d.severity === 'error' && !SEMANTIC.has(d.code));
  if (syntax.length > 0) return { accepted: false, ast: undefined };
  const toShape = (n: C4BetaStatementNode): Shape => {
    const shape: Shape = { type: n.type, range: trim(source, n.range.start, n.range.end) };
    const children = n.type === 'Element' ? n.children : [];
    if (children.length > 0) shape.children = children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: result.ast.children.map(toShape) };
}

/** A sentence model learnt from corpus sources the grammar accepts. */
export function learnSentenceModel(sources: readonly string[]): SentenceModel {
  const model = emptyModel(referenceParser());
  for (const source of sources) {
    const lexed = grammarTokens(source);
    if (lexed.error !== undefined) continue;
    const tokens: LexToken[] = parserTokens(lexed);
    const tree = referenceParser().parse(tokens.map((t) => t.name));
    if (!tree) continue;
    learnDerivation(model, tree);
    let prev = '';
    let prevEnd = 0;
    for (const t of tokens) {
      learnToken(model, prev, t.name, lexed.text.slice(prevEnd, t.end));
      prev = t.name;
      prevEnd = t.end;
    }
  }
  return model;
}
