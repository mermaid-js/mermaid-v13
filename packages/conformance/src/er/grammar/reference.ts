/**
 * The grammar-side half of the ER differential test: lex with the grammar's lexer, parse with
 * the reference parser built from the grammar, and project the result to an AST shape that
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
import type { AstShape, ReferenceParser, SentenceModel } from '@mermaid-js/gen-grammar';
import { parseEr } from '@mermaid-js/diagram-er';
import type { ErDocument, ErStatementNode } from '@mermaid-js/diagram-er';
import { preprocess } from '@mermaid-js/core/preprocess';
import { erGrammar, grammarTokens } from './er-grammar.ts';

/** A comparable AST: type, source range (blanks trimmed off both ends) and children. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** Accepted, but a check beyond the syntax failed (a limit). */
  semanticError?: boolean;
  /** Statement-level AST shapes, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(erGrammar().grammar);
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
  const tree = referenceParser().parse(lexed.tokens.map((t) => t.name));
  if (!tree) return { accepted: false, ast: undefined };
  const toShape = (a: AstShape): Shape => {
    const text = lexed.input.text;
    let from = lexed.tokens[a.start]?.outerStart ?? 0;
    let to = lexed.tokens[a.end - 1]?.outerEnd ?? 0;
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    const shape: Shape = { type: a.type, range: trim(source, r.start, r.end) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** Errors that come from checks beyond the syntax. */
const SEMANTIC = new Set(['NODE_LIMIT', 'EDGE_LIMIT', 'DEPTH_LIMIT']);

/** Accept/reject and AST shape by the hand-written parser. */
export function handWrittenVerdict(source: string): Verdict {
  const result = parseEr(source, { preprocessed: preprocess(source) });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  return {
    accepted: true,
    semanticError: errors.length > 0,
    ast: handWrittenShapes(source, result.ast),
  };
}

function handWrittenShapes(source: string, doc: ErDocument): Shape[] {
  const shape = (s: ErStatementNode | NonNullable<ErStatementNode['children']>[number]): Shape => {
    const out: Shape = { type: s.type, range: trim(source, s.range.start, s.range.end) };
    const kids = (s.children ?? []) as ErStatementNode[];
    if (kids.length > 0) out.children = kids.map(shape);
    return out;
  };
  return doc.children.map(shape);
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

/** Whether mermaid\@12 accepted the syntax: false on a jison parse or lexical error. */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Parse error|Lexical error|Expecting /.test(result.error ?? '') ? false : undefined;
}
