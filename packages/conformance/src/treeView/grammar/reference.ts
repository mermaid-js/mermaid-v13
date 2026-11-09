/**
 * The grammar-side half of the treeView differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape that
 * the hand-written parser's AST can be compared with (the statements, nodes included, in source
 * order). Dev and CI only.
 *
 * After a box-drawing rewrite the reference reads the rewritten text, whose offsets are not the
 * source's: those sources are compared on accept/reject only (`ast` is undefined on both sides).
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
import { parseTreeView } from '@mermaid-js/diagram-treeview';
import type { TreeViewStatementNode } from '@mermaid-js/diagram-treeview';
import { treeViewLex } from '@mermaid-js/diagram-treeview/testing';
import { preprocess } from '@mermaid-js/core/preprocess';
import { grammarTokens, parserTokens, treeViewGrammar } from './treeview-grammar.ts';

/** A comparable AST: type, source range (blanks trimmed off both ends) and children. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** AST shapes, when accepted and the box pass did not rewrite the text. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(treeViewGrammar().grammar);
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
  if (lexed.boxed) return { accepted: true, ast: undefined };
  const text = lexed.input.text;
  const toShape = (a: AstShape): Shape => {
    const [from, to] = trim(
      text,
      tokens[a.start]?.outerStart ?? 0,
      tokens[a.end - 1]?.outerEnd ?? 0
    );
    const r = sourceRange(lexed.input, from, to);
    const shape: Shape = { type: a.type, range: trim(source, r.start, r.end) };
    if (a.children.length > 0) shape.children = a.children.map(toShape);
    return shape;
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

function handShape(source: string, n: TreeViewStatementNode): Shape {
  return { type: n.type, range: trim(source, n.range.start, n.range.end) };
}

/** Accept/reject and AST shape by the hand-written parser (treeView has no semantic errors). */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseTreeView(source, { preprocessed: pre });
  const errors = [...pre.diagnostics, ...result.diagnostics].filter((d) => d.severity === 'error');
  if (errors.length > 0) return { accepted: false, ast: undefined };
  if (treeViewLex(source).box.kind === 'rewrite') return { accepted: true, ast: undefined };
  return { accepted: true, ast: result.ast.children.map((n) => handShape(source, n)) };
}

/** A sentence model learnt from corpus sources the grammar accepts with no box rewrite. */
export function learnSentenceModel(sources: readonly string[]): SentenceModel {
  const model = emptyModel(referenceParser());
  for (const source of sources) {
    const lexed = grammarTokens(source);
    if (lexed.error !== undefined || lexed.boxed) continue;
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
 * Whether mermaid\@12 accepted the syntax: false on a Langium lexer or parser error or a
 * box-drawing error, undefined when it rejected for another reason.
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Lexer error|Parse error|^Line \d+: /.test(result.error ?? '') ? false : undefined;
}
