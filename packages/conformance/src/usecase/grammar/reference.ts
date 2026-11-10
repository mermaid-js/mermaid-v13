/**
 * The grammar-side half of the usecase differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape that
 * the hand-written parser's AST can be compared with (statements, and the elements of each
 * relation and boundary). Dev and CI only.
 */
import { astOf, buildParser, sourceRange } from '@mermaid-js/gen-grammar';
import type { AstShape, ReferenceParser } from '@mermaid-js/gen-grammar';
import { MODEL_CODES, parseUsecase } from '@mermaid-js/diagram-usecase';
import type { UsecaseStatementNode } from '@mermaid-js/diagram-usecase';
import { preprocess } from '@mermaid-js/core/preprocess';
import { grammarTokens, usecaseGrammar } from './usecase-grammar.ts';

/**
 * The parity exclusions, left out of the differential: core reads an unclosed `%%{` otherwise
 * (`UNCLOSED_DIRECTIVE`) before the grammar applies.
 */
export const EXCLUDED = 'usecase-cases/directive-unclosed';

/** A comparable AST: type, source range (blanks trimmed off both ends) and children. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** AST shapes, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
function referenceParser(): ReferenceParser {
  parser ??= buildParser(usecaseGrammar().grammar);
  return parser;
}

/**
 * A range with blanks trimmed off both ends, and a last `;`: the parser's range takes the `;` v12
 * dropped from a style line (it belongs to the token before it), the grammar's does not.
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
  const toShape = (a: AstShape): Shape => {
    const from = tokens[a.start]?.start ?? 0;
    const to = tokens[a.end - 1]?.end ?? 0;
    const r = sourceRange(lexed.input, from, to);
    const shape: Shape = { type: a.type, range: trim(source, r.start, r.end) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

function handShape(source: string, n: UsecaseStatementNode): Shape {
  const shape: Shape = { type: n.type, range: trim(source, n.range.start, n.range.end) };
  if ((n.type === 'Relation' || n.type === 'Boundary') && n.children.length > 0) {
    shape.children = n.children.map((c) => ({
      type: c.type,
      range: trim(source, c.range.start, c.range.end),
    }));
  }
  return shape;
}

/** Accept/reject and AST shape by the hand-written parser (the model's checks left aside). */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseUsecase(source, { preprocessed: pre });
  const errors = [...pre.diagnostics, ...result.diagnostics].filter((d) => d.severity === 'error');
  if (errors.some((d) => !MODEL_CODES.has(d.code))) return { accepted: false, ast: undefined };
  return { accepted: true, ast: result.ast.children.map((n) => handShape(source, n)) };
}

/**
 * Whether mermaid\@12 accepted the syntax: false on a Chevrotain lexer or parser error,
 * undefined when it rejected for another reason (its model builder or `JSON.parse` threw).
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /^Error (lexing|parsing) usecase diagram/.test(result.error ?? '') ? false : undefined;
}
