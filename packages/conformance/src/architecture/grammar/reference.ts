/**
 * The grammar-side half of the architecture differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape
 * that the hand-written parser's AST can be compared with (its statements). Dev and CI only.
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
import { parseArchitecture } from '@mermaid-js/diagram-architecture';
import type { ArchitectureStatementNode } from '@mermaid-js/diagram-architecture';
import { preprocess } from '@mermaid-js/core/preprocess';
import { grammarTokens, parserTokens, architectureGrammar } from './architecture-grammar.ts';

/**
 * The parity exclusions, left out of the differential: core rejects them (`UNCLOSED_DIRECTIVE`)
 * before the grammar applies.
 */
export const EXCLUDED = [
  'architecture-cases/unclosed-directive',
  'architecture-cases/directive-unclosed-in-line',
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
  parser ??= buildParser(architectureGrammar().grammar);
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

/** Errors that come from checks beyond the syntax: v12's DB threw them (all `ARCHITECTURE_…`). */
const semantic = (code: string): boolean => code.startsWith('ARCHITECTURE_');

function handShape(source: string, n: ArchitectureStatementNode): Shape {
  return { type: n.type, range: trim(source, n.range.start, n.range.end) };
}

/** Accept/reject and AST shape by the hand-written parser. */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseArchitecture(source, { preprocessed: pre });
  const errors = [...pre.diagnostics, ...result.diagnostics].filter((d) => d.severity === 'error');
  if (errors.some((d) => !semantic(d.code))) return { accepted: false, ast: undefined };
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
 * when it rejected for another reason (an error thrown by its DB population).
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Lexer error|Parse error/.test(result.error ?? '') ? false : undefined;
}
