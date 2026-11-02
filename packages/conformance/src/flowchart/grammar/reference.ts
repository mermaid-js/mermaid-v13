/**
 * The grammar-side half of the differential test: lex with the grammar's lexer, parse with
 * the reference parser built from the grammar, and project the result to an AST shape that
 * the hand-written parser's AST can be compared with. Dev and CI only.
 */
import { astOf, buildParser, sourceRange } from '@mermaid-js/gen-grammar';
import type { AstShape, ReferenceParser } from '@mermaid-js/gen-grammar';
import { parseFlowchart } from '@mermaid-js/diagram-flowchart';
import type { FlowDocument, FlowStatementNode } from '@mermaid-js/diagram-flowchart';
import { preprocess } from '@mermaid-js/core/preprocess';
import { flowchartGrammar, grammarTokens } from './flowchart-grammar.ts';

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
  parser ??= buildParser(flowchartGrammar().grammar);
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
    // Blanks are trimmed in the lexer input first: a token's trailing blanks may run on over
    // comment lines v12 removed.
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    const shape: Shape = { type: a.type, range: trim(source, r.start, r.end) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** Errors that come from checks beyond the syntax (YAML, limits, link indexes). */
const SEMANTIC = new Set(['SHAPE_DATA', 'UNKNOWN_SHAPE', 'LINK_STYLE_INDEX', 'EDGE_LIMIT']);

/** Accept/reject and AST shape by the hand-written parser. */
export function handWrittenVerdict(source: string): Verdict {
  const result = parseFlowchart(source, { preprocessed: preprocess(source) });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  return {
    accepted: true,
    semanticError: errors.length > 0,
    ast: handWrittenShapes(source, result.ast),
  };
}

function handWrittenShapes(source: string, doc: FlowDocument): Shape[] {
  const statement = (s: FlowStatementNode): Shape => {
    const shape: Shape = { type: s.type, range: trim(source, s.range.start, s.range.end) };
    if (s.type === 'Subgraph') {
      if (s.children.length > 0) shape.children = s.children.map(statement);
    } else if (s.type === 'Chain') {
      const parts: Shape[] = [];
      const links = new Set<string>();
      for (const c of s.children) {
        if (c.type === 'Node')
          parts.push({ type: 'Node', range: trim(source, c.range.start, c.range.end) });
        else {
          const r = trim(source, c.linkRange.start, c.linkRange.end);
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
