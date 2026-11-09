/**
 * The requirement facet's completion and hover tables (DESIGN §4.5, D95): how each keyword kind
 * is offered, and small helpers. Keyword docs are not here: they come from the grammar file
 * (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';

/** A keyword item: offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
}

/** Statement keywords, in the order they are offered (v12's syntax page spelling). */
export const STATEMENT_KEYWORDS: readonly KeywordItem[] = [
  { kind: T.Requirement, label: 'requirement' },
  { kind: T.FunctionalRequirement, label: 'functionalRequirement' },
  { kind: T.InterfaceRequirement, label: 'interfaceRequirement' },
  { kind: T.PerformanceRequirement, label: 'performanceRequirement' },
  { kind: T.PhysicalRequirement, label: 'physicalRequirement' },
  { kind: T.DesignConstraint, label: 'designConstraint' },
  { kind: T.Element, label: 'element' },
  { kind: T.Style, label: 'style' },
  { kind: T.ClassDef, label: 'classDef' },
  { kind: T.Class, label: 'class' },
  { kind: T.DirectionTB, label: 'direction TB' },
  { kind: T.DirectionBT, label: 'direction BT' },
  { kind: T.DirectionLR, label: 'direction LR' },
  { kind: T.DirectionRL, label: 'direction RL' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
];

/** Body fields, inserted with their `: `. */
export const FIELDS: readonly KeywordItem[] = [
  { kind: T.Id, label: 'id', insert: 'id: ' },
  { kind: T.Text, label: 'text', insert: 'text: ' },
  { kind: T.Risk, label: 'risk', insert: 'risk: ' },
  { kind: T.VerifyMethod, label: 'verifymethod', insert: 'verifymethod: ' },
  { kind: T.Type, label: 'type', insert: 'type: ' },
  { kind: T.DocRef, label: 'docref', insert: 'docref: ' },
];

/** Field values with a fixed set: the risks and the verification methods. */
export const VALUES: readonly KeywordItem[] = [
  { kind: T.LowRisk, label: 'low' },
  { kind: T.MedRisk, label: 'medium' },
  { kind: T.HighRisk, label: 'high' },
  { kind: T.VerifyAnalysis, label: 'analysis' },
  { kind: T.VerifyDemonstration, label: 'demonstration' },
  { kind: T.VerifyInspection, label: 'inspection' },
  { kind: T.VerifyTest, label: 'test' },
];

/** The relationship kinds and what each says of the source and the target (v12's syntax page). */
export const RELATIONSHIPS: readonly (KeywordItem & { readonly meaning: string })[] = [
  { kind: T.Contains, label: 'contains', meaning: 'the source contains the target' },
  { kind: T.Copies, label: 'copies', meaning: 'the source copies the target' },
  { kind: T.Derives, label: 'derives', meaning: 'the source derives from the target' },
  { kind: T.Satisfies, label: 'satisfies', meaning: 'the source satisfies the target' },
  { kind: T.Verifies, label: 'verifies', meaning: 'the source verifies the target' },
  { kind: T.Refines, label: 'refines', meaning: 'the source refines the target' },
  { kind: T.Traces, label: 'traces', meaning: 'the source traces to the target' },
];

/** The operators of a relation and the class shorthand. */
export const OPERATORS: readonly KeywordItem[] = [
  { kind: T.Line, label: '-', insert: '- ' },
  { kind: T.EndArrowL, label: '<-', insert: '<- ' },
  { kind: T.EndArrowR, label: '->', insert: '-> ' },
  { kind: T.StyleSeparator, label: ':::' },
];

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

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
