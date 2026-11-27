/**
 * The grammar-side half of the block differential test: lex with the grammar's lexer, parse
 * with the reference parser built from the grammar, and project the result to an AST shape that
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
import type { AstShape, LexToken, ReferenceParser, SentenceModel } from '@mermaid-js/gen-grammar';
import { parseBlock } from '@mermaid-js/diagram-block';
import type { BlockStatementNode } from '@mermaid-js/diagram-block';
import { isLimitCode } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { blockGrammar, grammarTokens } from './block-grammar.ts';

/** A comparable AST: statement type, source range (blanks trimmed off both ends), children. */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** The AST shapes, nested as composites nest, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(blockGrammar().grammar);
  return parser;
}

/**
 * `[start, end)` without blanks at either end, nor a `;` at the end: v12's preprocessing drops
 * the last `;` of a `style` line, which the grammar's input does not hold and the hand-written
 * lexer counts to the token before it.
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
  const text = lexed.input.text;
  const toShape = (a: AstShape): Shape => {
    let from = tokens[a.start]?.outerStart ?? 0;
    let to = tokens[a.end - 1]?.outerEnd ?? 0;
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    // A character's mapped range runs over a span removed right after it (a directive after
    // the statement); the statement ends one past where its last character starts.
    // Text that replaced a run (an entity placeholder: each of its characters starts where the
    // run does) ends where the run does.
    const last = lexed.input.from[to - 1];
    const replaced = to >= 2 && lexed.input.from[to - 2] === last;
    const end = last === undefined || replaced ? r.end : Math.min(r.end, last + 1);
    return { type: a.type, range: trim(source, r.start, end) };
  };
  return { accepted: true, ast: project(astOf(tree), toShape) };
}

/**
 * The grammar's shapes as the hand-written AST nests them: the rest of a composite's header
 * chain (`HeaderEdge`, `HeaderBlock`) stands right after the composite, at its level, as an
 * `Edge` and a `Block` (the model puts them there, GAPS #554).
 */
function project(shapes: readonly AstShape[], toShape: (a: AstShape) => Shape): Shape[] {
  const out: Shape[] = [];
  for (const a of shapes) {
    const shape = toShape(a);
    out.push(shape);
    const header = a.children.filter((c) => c.type === 'HeaderEdge' || c.type === 'HeaderBlock');
    const body = a.children.filter((c) => c.type !== 'HeaderEdge' && c.type !== 'HeaderBlock');
    if (body.length > 0) shape.children = project(body, toShape);
    for (const h of header)
      out.push({ ...toShape(h), type: h.type === 'HeaderEdge' ? 'Edge' : 'Block' });
  }
  return out;
}

function handShape(source: string, n: BlockStatementNode): Shape {
  const shape: Shape = { type: n.type, range: trim(source, n.range.start, n.range.end) };
  if (n.type === 'Composite' && n.children.length > 0)
    shape.children = n.children.map((c) => handShape(source, c));
  return shape;
}

/**
 * Accept/reject (syntax only, as the grammar sees it: warnings and limits aside) and AST shape
 * by the hand-written parser.
 */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseBlock(source, { preprocessed: pre });
  const errors = [...pre.diagnostics, ...result.diagnostics].filter(
    (d) => d.severity === 'error' && !isLimitCode(d.code)
  );
  if (errors.length > 0) return { accepted: false, ast: undefined };
  return { accepted: true, ast: result.ast.children.map((n) => handShape(source, n)) };
}

/** A sentence model learnt from corpus sources the grammar accepts. */
export function learnSentenceModel(sources: readonly string[]): SentenceModel {
  const model = emptyModel(referenceParser());
  for (const source of sources) {
    const lexed = grammarTokens(source);
    if (lexed.error !== undefined) continue;
    const tokens: LexToken[] = lexed.tokens;
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

/** The end of the directives (`%%{…}%%`) from `i` on: `i` when none starts there. */
function afterDirectives(source: string, i: number): number {
  let at = i;
  while (source.startsWith('%%{', at)) {
    const end = source.indexOf('}%%', at + 3);
    if (end < 0) return at;
    at = end + 3;
  }
  return at;
}

/**
 * `source` as mermaid\@12 is asked about it: each markdown string written as a string. D736
 * takes a markdown string wherever v12 took a string, which v12's grammar rejected; everything
 * else stays for v12 to decide. A directive may split a markdown string's quote and backtick
 * (directives are removed before lexing); it stays where it is.
 */
export function withoutMarkdownStrings(source: string): string {
  if (!source.includes('`')) return source;
  let out = '';
  let from = 0;
  for (let q = source.indexOf('"'); q >= 0; q = source.indexOf('"', q + 1)) {
    const open = afterDirectives(source, q + 1);
    if (source[open] !== '`') continue;
    let close = open + 1;
    while (close < source.length && source[close] !== '`' && source[close] !== '"') close++;
    if (source[close] !== '`') continue;
    const quote = afterDirectives(source, close + 1);
    if (source[quote] !== '"') continue;
    out +=
      source.slice(from, open) + source.slice(open + 1, close) + source.slice(close + 1, quote);
    from = quote;
    q = quote;
  }
  return out + source.slice(from);
}

/**
 * Whether mermaid\@12 accepted the syntax: false on a jison lexer or parse error, undefined
 * when it rejected for another reason (its DB's TypeError on `style`, or it did not detect the
 * source as block).
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Lexical error|Parse error/.test(result.error ?? '') ? false : undefined;
}
