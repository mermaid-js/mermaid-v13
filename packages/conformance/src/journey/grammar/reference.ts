/**
 * The grammar-side half of the journey differential test: lex with the grammar's lexer, parse
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
import { parseJourney } from '@mermaid-js/diagram-journey';
import type { JourneyDocument } from '@mermaid-js/diagram-journey';
import { preprocess } from '@mermaid-js/core/preprocess';
import { grammarTokens, journeyGrammar } from './journey-grammar.ts';

/** A comparable AST: type and source range (blanks trimmed off both ends). */
export interface Shape {
  type: string;
  range: [number, number];
  children?: Shape[];
}

export interface Verdict {
  accepted: boolean;
  /** Statement-level AST shapes, when accepted. */
  ast: Shape[] | undefined;
}

let parser: ReferenceParser | undefined;
export function referenceParser(): ReferenceParser {
  parser ??= buildParser(journeyGrammar().grammar);
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

/**
 * Accept/reject and statement-level AST shape by the hand-written parser (a task's actor
 * mentions are inside one grammar token, so they are left out). Preprocess diagnostics are
 * left out (an unclosed directive): the grammar reads the text after v12's preprocessing.
 */
export function handWrittenVerdict(source: string): Verdict {
  const result = parseJourney(source, { preprocessed: preprocess(source) });
  if (result.diagnostics.some((d) => d.severity === 'error')) {
    return { accepted: false, ast: undefined };
  }
  return { accepted: true, ast: handWrittenShapes(source, result.ast) };
}

function handWrittenShapes(source: string, doc: JourneyDocument): Shape[] {
  return doc.children.map((s) => ({
    type: s.type,
    range: trim(source, s.range.start, s.range.end),
  }));
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

/** Whether mermaid\@12 accepted the syntax: false on a jison parse or lexical error. */
export function v12Syntax(result: { accepted: boolean; error?: string }): boolean | undefined {
  if (result.accepted) return true;
  return /Parse error|Lexical error|Expecting /.test(result.error ?? '') ? false : undefined;
}
