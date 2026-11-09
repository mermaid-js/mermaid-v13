/**
 * The grammar-side half of the wardley differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape
 * that the hand-written parser's AST can be compared with (statements and the components
 * inside pipelines). Dev and CI only.
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
import {
  parseWardley,
  WARDLEY_OUT_OF_RANGE,
  WARDLEY_UNKNOWN_PARENT,
} from '@mermaid-js/diagram-wardley';
import type { WardleyStatementNode } from '@mermaid-js/diagram-wardley';
import { preprocess } from '@mermaid-js/core/preprocess';
import { grammarTokens, parserTokens, wardleyGrammar } from './wardley-grammar.ts';

/**
 * The parity exclusions, left out of the differential: core rejects them (`UNCLOSED_DIRECTIVE`)
 * before the grammar applies.
 */
export const EXCLUDED = [
  'wardley-cases/unclosed-directive',
  'wardley-cases/directive-unclosed-in-line',
];

/** A comparable AST: type, source range (blanks trimmed off both ends) and children. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** Accepted, but a check beyond the syntax failed (v12's DB threw). */
  semanticError?: boolean;
  /** AST shapes, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(wardleyGrammar().grammar);
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
  const text = lexed.input.text;
  const toShape = (a: AstShape): Shape => {
    let from = tokens[a.start]?.outerStart ?? 0;
    let to = tokens[a.end - 1]?.outerEnd ?? 0;
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    const shape: Shape = { type: a.type, range: trim(source, r.start, r.end) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** Errors that come from checks beyond the syntax: v12's DB threw them. */
const SEMANTIC = new Set([WARDLEY_OUT_OF_RANGE, WARDLEY_UNKNOWN_PARENT]);

function handShape(source: string, n: WardleyStatementNode): Shape {
  const shape: Shape = { type: n.type, range: trim(source, n.range.start, n.range.end) };
  if (n.type === 'Pipeline' && n.children.length > 0) {
    shape.children = n.children.map((c) => ({
      type: c.type,
      range: trim(source, c.range.start, c.range.end),
    }));
  }
  return shape;
}

/** Accept/reject and AST shape by the hand-written parser. */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseWardley(source, { preprocessed: pre });
  const errors = [...pre.diagnostics, ...result.diagnostics].filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  return {
    accepted: true,
    semanticError: errors.length > 0,
    ast: result.ast.children.map((n) => handShape(source, n)),
  };
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
      const r = sourceRange(lexed.input, prevEnd, t.outerEnd);
      learnToken(model, prev, t.name, source.slice(r.start, r.end));
      prev = t.name;
      prevEnd = t.outerEnd;
    }
  }
  return model;
}

/**
 * Whether mermaid\@12 accepted the syntax: false on a Langium lexer or parser error, undefined
 * when it rejected for another reason (a range error or a pipeline naming no component, thrown
 * by its DB population).
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Lexer error|Parse error/.test(result.error ?? '') ? false : undefined;
}
