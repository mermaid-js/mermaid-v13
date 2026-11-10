/**
 * The grammar-side half of the differential test: lex with the grammar's lexer, parse with
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
import { parseAgentflow } from '@mermaid-js/diagram-agentflow';
import type { AgentflowDocument, AgentflowStatementNode } from '@mermaid-js/diagram-agentflow';
import { preprocess } from '@mermaid-js/core/preprocess';
import { agentflowGrammar, grammarTokens } from './agentflow-grammar.ts';

/** A comparable AST: type, source range (blanks trimmed off both ends) and children. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** Accepted, but a check beyond the syntax failed (the AST may be cut short). */
  semanticError?: boolean;
  /** Statement-level AST shapes, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(agentflowGrammar().grammar);
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
  // A range that ends where a directive was cut out maps to either side of it.
  const directives = preprocess(source).directives.map((d) => d.range);
  const toShape = (a: AstShape): Shape => {
    const text = lexed.input.text;
    let from = lexed.tokens[a.start]?.outerStart ?? 0;
    let to = lexed.tokens[a.end - 1]?.outerEnd ?? 0;
    // Blanks are trimmed in the lexer input first: a token's trailing blanks may run on over
    // comment lines v12 removed.
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    const shape: Shape = { type: a.type, range: trimRemoved(source, r.start, r.end, directives) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** Errors that come from checks beyond the syntax (YAML, limits, link indexes). */
const SEMANTIC = new Set(['SHAPE_DATA', 'UNKNOWN_SHAPE', 'LINK_STYLE_INDEX', 'EDGE_LIMIT']);

/** Accept/reject and AST shape by the hand-written parser. */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseAgentflow(source, { preprocessed: pre });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  return {
    accepted: true,
    semanticError: errors.length > 0,
    ast: handWrittenShapes(
      source,
      result.ast,
      pre.directives.map((d) => d.range)
    ),
  };
}

function handWrittenShapes(
  source: string,
  doc: AgentflowDocument,
  directives: readonly { start: number; end: number }[]
): Shape[] {
  const cut = (src: string, start: number, end: number) => trimRemoved(src, start, end, directives);
  const statement = (s: AgentflowStatementNode): Shape => {
    const shape: Shape = { type: s.type, range: cut(source, s.range.start, s.range.end) };
    if (s.type === 'Flow' || s.type === 'Global') {
      if (s.children.length > 0) shape.children = s.children.map(statement);
    } else if (s.type === 'Chain') {
      const parts: Shape[] = [];
      const links = new Set<string>();
      for (const c of s.children) {
        if (c.type === 'Node')
          parts.push({ type: 'Node', range: cut(source, c.range.start, c.range.end) });
        else {
          const r = cut(source, c.linkRange.start, c.linkRange.end);
          if (links.has(r.join())) continue;
          links.add(r.join());
          parts.push({ type: 'Link', range: r });
        }
      }
      parts.sort((a, b) => a.range[0] - b.range[0]);
      shape.children = parts;
    }
    return shape;
  };
  return doc.children.map(statement);
}

/**
 * {@link trim}, also past directives at either end: a token's range covers the removed spans
 * it runs over (`a{b} %%{init: {}}%%`), the grammar's text has none.
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
 * lexical error, undefined when it stopped for another reason (YAML in shape data, a link
 * index, an unknown shape), which can hide a later syntax error. The grammar covers the
 * syntax only.
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Parse error|Lexical error|Expecting /.test(result.error ?? '') ? false : undefined;
}
