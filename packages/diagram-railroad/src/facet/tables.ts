/**
 * What the railroad facet's parts share (DESIGN §4.5, D511): one facet reads the four notations,
 * so its tables are each notation's generated ones, picked by the notation the parse used (the
 * model's `notation`). Keyword docs are not written here: they come from the grammar files
 * (`generated/*.docs.ts`).
 */
import type { Range, TokenCategory, TokenStream } from '@mermaid-js/core/parser-kit';
import { railroadCategories } from '../generated/categories.ts';
import { railroadDocs } from '../generated/docs.ts';
import { railroadAbnfCategories } from '../generated/railroad-abnf.categories.ts';
import { railroadAbnfDocs } from '../generated/railroad-abnf.docs.ts';
import { railroadEbnfCategories } from '../generated/railroad-ebnf.categories.ts';
import { railroadEbnfDocs } from '../generated/railroad-ebnf.docs.ts';
import { railroadPegCategories } from '../generated/railroad-peg.categories.ts';
import { railroadPegDocs } from '../generated/railroad-peg.docs.ts';
import type { RailroadModel } from '../model.ts';
import type { RailroadDocument, RailroadRuleNode } from '../parser/ast.ts';
import type { RailroadNotation } from '../parser/tokens.ts';

/** Each notation's kind → category table (D94), as gen-grammar wrote it from its grammar. */
export const NOTATION_CATEGORIES: Readonly<
  Record<RailroadNotation, Readonly<Record<number, TokenCategory>>>
> = {
  railroad: railroadCategories,
  railroadEbnf: railroadEbnfCategories,
  railroadAbnf: railroadAbnfCategories,
  railroadPeg: railroadPegCategories,
};

/**
 * The facet's one table: the four notations' tables together. The kinds are one set shared by
 * the four lexers (`parser/tokens.ts`), and a kind two notations both emit has the same
 * category in each (`language.spec.ts` holds that), so the union is each notation's table.
 */
export const RAILROAD_CATEGORIES: Readonly<Record<number, TokenCategory>> = Object.freeze(
  Object.assign({}, ...Object.values(NOTATION_CATEGORIES)) as Record<number, TokenCategory>
);

/** Each notation's one-line keyword and operator docs (D93), from its grammar file. */
export const NOTATION_DOCS: Readonly<
  Record<RailroadNotation, Readonly<Partial<Record<number, string>>>>
> = {
  railroad: railroadDocs,
  railroadEbnf: railroadEbnfDocs,
  railroadAbnf: railroadAbnfDocs,
  railroadPeg: railroadPegDocs,
};

/** The notation a parse read its text in (the model always has one). */
export function notationOf(model: unknown): RailroadNotation {
  return (model as Partial<RailroadModel> | undefined)?.notation ?? 'railroad';
}

/** The rules of `doc` by name, in source order; each name's rules in source order. */
export function rulesByName(doc: RailroadDocument): Map<string, RailroadRuleNode[]> {
  const out = new Map<string, RailroadRuleNode[]>();
  for (const n of doc.children) {
    if (n.type !== 'Rule') continue;
    const list = out.get(n.name);
    if (list) list.push(n);
    else out.set(n.name, [n]);
  }
  return out;
}

/** Index of the last token of `tokens` starting at or before `offset`, or -1. */
export function tokenBefore(tokens: TokenStream, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** The line of `text` that holds `at`, from `at` to its end (no line break). */
export function restOfLine(text: string, at: number): string {
  let end = at;
  while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end++;
  return text.slice(at, end);
}
