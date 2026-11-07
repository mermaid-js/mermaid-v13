/**
 * The grammar-side half of the mindmap differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape
 * that the hand-written parser's AST can be compared with. Dev and CI only.
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
import { parseMindmap } from '@mermaid-js/diagram-mindmap';
import { preprocess } from '@mermaid-js/core/preprocess';
import { grammarTokens, mindmapGrammar } from './mindmap-grammar.ts';

/** A comparable AST: type and source range (blanks trimmed off both ends). */
export interface Shape {
  type: string;
  range: [number, number];
}

export interface Verdict {
  accepted: boolean;
  /** Accepted, but a check beyond the syntax failed (a second root, v12's DB). */
  semanticError?: boolean;
  /** Statement-level AST shapes, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(mindmapGrammar().grammar);
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
    return { type: a.type, range: trim(source, r.start, r.end) };
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** Errors from checks beyond the syntax: v12's DB threw on a second root and a decoration first. */
const SEMANTIC = new Set(['MINDMAP_SECOND_ROOT', 'MINDMAP_DECORATION_BEFORE_NODE']);

/**
 * Accept/reject and AST shape by the hand-written parser. Preprocess diagnostics are left out
 * (an unclosed directive): the grammar reads the text after v12's preprocessing.
 */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseMindmap(source, { preprocessed: pre });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  const directives = pre.directives.map((d) => d.range);
  return {
    accepted: true,
    semanticError: errors.length > 0,
    ast: result.ast.children.map((s) => ({
      type: s.type,
      range: trimRemoved(source, s.range.start, s.range.end, directives),
    })),
  };
}

/**
 * {@link trim}, also past directives at either end: a token's range covers the removed spans
 * it runs over (`2002 %%{init: {}}%% : x`), the grammar's text has none.
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
 * lexical error, undefined when it stopped for another reason (its DB's second-root error or
 * `TypeError` on a decoration before any node), which can hide a later syntax error.
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Parse error|Lexical error|Expecting /.test(result.error ?? '') ? false : undefined;
}
