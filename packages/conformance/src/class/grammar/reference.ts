/**
 * The grammar-side half of the class differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape
 * the hand-written parser's AST can be compared with. Dev and CI only.
 */
import { astOf, buildParser, sourceRange } from '@mermaid-js/gen-grammar';
import type { AstShape, ReferenceParser } from '@mermaid-js/gen-grammar';
import { parseClass } from '@mermaid-js/diagram-class';
import type { ClassDocument, ClassStatementNode } from '@mermaid-js/diagram-class';
import { preprocess } from '@mermaid-js/core/preprocess';
import { classGrammar, grammarTokens } from './class-grammar.ts';

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
function referenceParser(): ReferenceParser {
  parser ??= buildParser(classGrammar().grammar);
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

/** Errors from checks beyond the syntax (v12 threw on them, outside its grammar). */
const SEMANTIC = new Set([
  'UNKNOWN_CLASS',
  'INVALID_METHOD',
  'EDGE_LIMIT',
  'NODE_LIMIT',
  'DEPTH_LIMIT',
]);

/** Accept/reject and AST shape by the hand-written parser. */
export function handWrittenVerdict(source: string): Verdict {
  const result = parseClass(source, { preprocessed: preprocess(source) });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  return {
    accepted: true,
    semanticError: errors.length > 0,
    ast: handWrittenShapes(source, result.ast),
  };
}

function handWrittenShapes(source: string, doc: ClassDocument): Shape[] {
  const statement = (s: ClassStatementNode): Shape => {
    const shape: Shape = { type: s.type, range: trim(source, s.range.start, s.range.end) };
    if (s.type === 'Namespace' && s.children.length > 0) shape.children = s.children.map(statement);
    return shape;
  };
  return doc.children.map(statement);
}

/**
 * Whether mermaid 12 accepted the syntax: true when it accepted, false on a jison parse or
 * lexical error, undefined when it stopped for another reason (it threw on a member or an
 * annotation), which can hide a later syntax error. The grammar covers the syntax only.
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Parse error|Lexical error|Expecting /.test(result.error ?? '') ? false : undefined;
}
