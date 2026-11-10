/**
 * The grammar-side half of the railroad differential tests, per notation: lex with the grammar's
 * lexer, parse with the reference parser built from the grammar, and project the result to an
 * AST shape that the hand-written parser's AST can be compared with. Dev and CI only.
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
import { preprocess } from '@mermaid-js/core/preprocess';
import { parseRailroad } from '@mermaid-js/diagram-railroad';
import type { RailroadNotation } from '@mermaid-js/diagram-railroad';
import { grammarTokens, parserTokens, railroadGrammar } from './railroad-grammar.ts';

/** A comparable AST: type and source range (blanks trimmed off both ends). */
export interface Shape {
  type: string;
  range: [number, number];
}

export interface Verdict {
  accepted: boolean;
  /** Statement-level AST shapes (header, `title`/`acc*` lines, rules), when accepted. */
  ast: Shape[] | undefined;
}

const parsers = new Map<RailroadNotation, ReferenceParser>();
export function referenceParser(notation: RailroadNotation): ReferenceParser {
  let p = parsers.get(notation);
  if (!p) parsers.set(notation, (p = buildParser(railroadGrammar(notation).grammar)));
  return p;
}

const trim = (src: string, start: number, end: number): [number, number] => {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(src[s] ?? '')) s++;
  while (e > s && /\s/.test(src[e - 1] ?? '')) e--;
  return [s, e];
};

/** Accept/reject and AST shape by the grammar (lexer + reference parser). */
export function referenceVerdict(notation: RailroadNotation, source: string): Verdict {
  const lexed = grammarTokens(notation, source);
  if (lexed.error !== undefined) return { accepted: false, ast: undefined };
  const tokens = parserTokens(notation, lexed);
  const tree = referenceParser(notation).parse(tokens.map((t) => t.name));
  if (!tree) return { accepted: false, ast: undefined };
  const text = lexed.input.text;
  const toShape = (a: AstShape): Shape => {
    let from = tokens[a.start]?.outerStart ?? 0;
    let to = tokens[a.end - 1]?.outerEnd ?? 0;
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    return { type: a.type, range: trim(source, r.start, r.end) };
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** Accept/reject and AST shape by the hand-written parser for `notation`. */
export function handWrittenVerdict(notation: RailroadNotation, source: string): Verdict {
  const pre = preprocess(source);
  const result = parseRailroad(source, { preprocessed: pre, notation });
  const errors = [...pre.diagnostics, ...result.diagnostics].filter((d) => d.severity === 'error');
  if (errors.length > 0) return { accepted: false, ast: undefined };
  return {
    accepted: true,
    ast: result.ast.children.map((n) => ({
      type: n.type,
      range: trim(source, n.range.start, n.range.end),
    })),
  };
}

/** A sentence model learnt from corpus sources the grammar accepts. */
export function learnSentenceModel(
  notation: RailroadNotation,
  sources: readonly string[]
): SentenceModel {
  const model = emptyModel(referenceParser(notation));
  for (const source of sources) {
    const lexed = grammarTokens(notation, source);
    if (lexed.error !== undefined) continue;
    const tokens: LexToken[] = parserTokens(notation, lexed);
    const tree = referenceParser(notation).parse(tokens.map((t) => t.name));
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
 * when it rejected for another reason (its preprocessing, before any railroad parser ran).
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Lexer error|Parse error|Parsing failed/.test(result.error ?? '') ? false : undefined;
}
