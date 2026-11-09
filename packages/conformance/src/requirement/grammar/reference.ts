/**
 * The grammar-side half of the requirement differential test: lex with the grammar's lexer,
 * parse with the reference parser built from the grammar, and project the result to an AST
 * shape that the hand-written parser's AST can be compared with. Dev and CI only.
 */
import {
  astOf,
  buildParser,
  emptyModel,
  learnDerivation,
  learnToken,
  sourceRange,
} from '@mermaid-js/gen-grammar';
import type { AstShape, ParseNode, ReferenceParser, SentenceModel } from '@mermaid-js/gen-grammar';
import { parseRequirement } from '@mermaid-js/diagram-requirement';
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { Oracle } from '../../oracle.ts';
import { grammarTokens, requirementGrammar } from './requirement-grammar.ts';

/** A comparable AST: type and source range (blanks trimmed off both ends). */
export interface Shape {
  type: string;
  range: [number, number];
}

export interface Verdict {
  accepted: boolean;
  /** Statement-level AST shapes, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(requirementGrammar().grammar);
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
    while (from < to && /\s/.test(text[from] ?? '')) from++;
    while (to > from && /\s/.test(text[to - 1] ?? '')) to--;
    const r = sourceRange(lexed.input, from, to);
    return { type: a.type, range: trimRemoved(source, r.start, r.end, directives) };
  };
  return { accepted: true, ast: astOf(tree).map(toShape) };
}

/** Errors from checks beyond the syntax: the style-copy cap (D433). */
const SEMANTIC: ReadonlySet<string> = new Set([LIMIT_CODES.maxLayoutWork]);

/**
 * Accept/reject and AST shape by the hand-written parser. Preprocess diagnostics are left out
 * (an unclosed directive): the grammar reads the text after v12's preprocessing.
 */
export function handWrittenVerdict(source: string): Verdict {
  const pre = preprocess(source);
  const result = parseRequirement(source, { preprocessed: pre });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.some((d) => !SEMANTIC.has(d.code))) return { accepted: false, ast: undefined };
  const directives = pre.directives.map((d) => d.range);
  return {
    accepted: true,
    ast: result.ast.children.map((s) => ({
      type: s.type,
      range: trimRemoved(source, s.range.start, s.range.end, directives),
    })),
  };
}

/**
 * {@link trim}, also past directives at either end: a token's range covers the removed spans
 * it runs over, the grammar's text has none.
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
 * lexical error, undefined when it stopped for another reason.
 */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Parse error|Lexical error|Expecting /.test(result.error ?? '') ? false : undefined;
}

/**
 * Where the grammar and mermaid\@12 with D431's and D432's lexer rules (`decided`) may
 * disagree, by design:
 * - the grammar accepts a line break after blanks inside a statement where v12's `\s+`
 *   swallowed it (GAPS #560, D431's choice), so it accepts what the decided oracle rejects
 *   when plain mermaid\@12 (`plain`) accepts it, or, for a generated variant (`from`: the
 *   source it was made from, whose meaning it keeps), when either accepts that source (a
 *   variant may add what D431 or D432 change: a blank before the header's line break, a
 *   comment line in a relation that has `direction` in it), or, where a text has both kinds
 *   of line break after blanks, when the decided oracle accepts it with each one the grammar
 *   reads as a blank joined into a space ({@link joinSwallowed});
 * - a direction statement ends its line (D432, GAPS #564), so the grammar rejects text after
 *   it that the decided oracle reads as more statements (`direction LR a - traces -> b`).
 * Returns why they disagree when they do, else undefined.
 */
export async function v12Disagrees(
  source: string,
  grammarAccepts: boolean,
  decided: Oracle,
  plain: Oracle,
  from?: string
): Promise<string | undefined> {
  const d = v12Syntax(await decided.parse(source));
  if (d === undefined || d === grammarAccepts) return undefined;
  if (grammarAccepts) {
    if (v12Syntax(await plain.parse(source)) === true) return undefined;
    const joined = joinSwallowed(source);
    if (joined !== undefined && v12Syntax(await decided.parse(joined)) === true) return undefined;
    if (from !== undefined && from !== source) {
      if (v12Syntax(await plain.parse(from)) === true) return undefined;
      if (v12Syntax(await decided.parse(from)) === true) return undefined;
    }
  }
  if (!grammarAccepts && DIRECTION_THEN_MORE.test(grammarInput(source))) return undefined;
  return `grammar ${grammarAccepts ? 'accepts' : 'rejects'}, mermaid@12 (D431, D432) ${grammarAccepts ? 'rejects' : 'accepts'}`;
}

/** A line that starts with a direction statement and goes on. */
const DIRECTION_THEN_MORE = /(?:^|\n)[^\S\n]*direction[^\S\n]+(?:TB|BT|RL|LR)\b[^\S\n]*[^\s#%]/i;

const grammarInput = (source: string) => grammarTokens(source).input.text;

/**
 * `source` with each line break after blanks that the grammar reads as one more blank (its
 * `blank` rule) replaced by a space, and each one it reads as a line break (`nl`) by a plain
 * line break: the text v12 would read the same way with either lexer. Undefined when the
 * grammar rejects `source`.
 */
export function joinSwallowed(source: string): string | undefined {
  const lexed = grammarTokens(source);
  if (lexed.error !== undefined) return undefined;
  const tree = referenceParser().parse(lexed.tokens.map((t) => t.name));
  if (!tree) return undefined;
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (n: ParseNode, rule: string | undefined) => {
    const here = n.production?.rule ?? rule;
    if (n.symbol === 'NEWLINE_AFTER_BLANK' && n.children.length === 0) {
      const t = lexed.tokens[n.start];
      if (!t) return;
      const r = sourceRange(lexed.input, t.start, t.end);
      edits.push({ ...r, text: here === 'blank' ? ' ' : '\n' });
      return;
    }
    for (const c of n.children) visit(c, here);
  };
  visit(tree, undefined);
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}
