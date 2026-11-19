/**
 * What the railroad facet's parts share (DESIGN §4.5, D511): one facet reads the four notations,
 * so its tables are each notation's generated ones, picked by the notation the parse used (the
 * model's `notation`). Keyword docs are not written here: they come from the grammar files
 * (`generated/*.docs.ts`).
 */
import { inKindSet } from '@mermaid-js/core/parser-kit';
import type { ParseResult, Range, TokenCategory } from '@mermaid-js/core/parser-kit';
import { lineAfter, span } from '@mermaid-js/shared/parser/facet';
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
import { RULE_SYMBOL } from '../parser/parser.ts';
import { RAILROAD_TRIVIA } from '../parser/tokens.ts';
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

/** Where a rule is defined: the rule itself, or the first line of one that fails to parse. */
export interface RuleDefinition {
  /** From the rule's name to its end (a rule that parsed) or its line's end (one that failed). */
  readonly range: Range;
  /** Whether the rule parsed (a failed rule still defines its name, `keepFailedRules`). */
  readonly parsed: boolean;
}

/**
 * The rules `result` defines, by name, in source order: every definition of a rule symbol, as
 * go-to-definition and rename read them, so a rule that fails to parse is one too.
 */
export function ruleDefinitions(
  text: string,
  result: ParseResult<unknown, RailroadDocument>
): Map<string, RuleDefinition[]> {
  const parsed = new Map<number, RailroadRuleNode>();
  for (const n of result.ast.children) if (n.type === 'Rule') parsed.set(n.nameRange.start, n);
  const out = new Map<string, RuleDefinition[]>();
  for (const s of result.symbols) {
    if (s.role !== 'def' || s.kind !== RULE_SYMBOL) continue;
    const rule = parsed.get(s.range.start);
    const start = s.range.start;
    const def: RuleDefinition = rule
      ? { range: rule.range, parsed: true }
      : { range: span(start, start + lineAfter(text, start).length), parsed: false };
    const list = out.get(s.name);
    if (list) list.push(def);
    else out.set(s.name, [def]);
  }
  return out;
}

/** A fenced code block holding `text`, whatever backticks it has. */
export function block(text: string): string {
  const runs = text.match(/`{3,}/g) ?? [];
  const fence = '`'.repeat(Math.max(2, ...runs.map((r) => r.length)) + 1);
  return `${fence}\n${text}\n${fence}`;
}

/** Whether a token of `kind` is trivia: a blank, comment, directive or YAML block. */
export const isTrivia = (kind: number): boolean => inKindSet(RAILROAD_TRIVIA, kind);

/** The rule's first line: from its start to its line's end or its own end, if sooner. */
export function ruleFirstLine(text: string, rule: { readonly range: Range }): string {
  const line = lineAfter(text, rule.range.start);
  return line.slice(0, rule.range.end - rule.range.start).trimEnd();
}
