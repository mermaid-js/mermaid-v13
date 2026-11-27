/**
 * The cynefin model (spec #423): what the parser (T2) produces and the layout (T3) reads. Plain,
 * frozen data in source order (R-ARCH-7). Shared contract of the cynefin tickets: change it only
 * additively, and say so in the run notes (`v13/docs/agents/runs/423/GAPS.md`).
 *
 * Text is kept as v12's value converter left it (quotes removed, `\n`/`\t` unescaped, `\x` → `x`),
 * never sanitised; `<br>`, entities and markdown are resolved when labels are laid out (D363).
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/**
 * The five fixed domains, in the order of v12's `DOMAIN_NAME` terminal
 * (`complex|complicated|clear|chaotic|confusion`; none is a prefix of another). The one list the
 * lexer, the parser and its messages read.
 */
export const CYNEFIN_DOMAIN_NAMES = [
  'complex',
  'complicated',
  'clear',
  'chaotic',
  'confusion',
] as const;

/** One of the five fixed domains (v12 `DOMAIN_NAME`). */
export type CynefinDomainName = (typeof CYNEFIN_DOMAIN_NAMES)[number];

/** One quoted item of a domain block. */
export interface CynefinItem {
  /** The label as v12's DB kept it. `""` is a valid, empty item. */
  readonly label: string;
  /**
   * Set when the item was written as a markdown string (`"`…`"`, #1368). `label` then holds the
   * backticks, as v12's did; the text between them is laid out as markdown.
   */
  readonly markdown?: true;
  /** `i:<domain>/<label>`; `@2`, … for a repeated label within the diagram. */
  readonly ast: AstId;
}

/** A declared domain: the name's first position, the last block's items (D364). */
export interface CynefinDomain {
  readonly name: CynefinDomainName;
  /** The drawn (last) block's id: `d:<name>`, or `d:<name>@2`, … when an earlier block was replaced. */
  readonly ast: AstId;
  readonly items: readonly CynefinItem[];
}

/** A `from --> to` transition. Self-loops are dropped (D365) and are not here. */
export interface CynefinTransition {
  readonly from: CynefinDomainName;
  readonly to: CynefinDomainName;
  /** The label; absent when none or empty (`: ""`), as v12's `t.label || undefined`. */
  readonly label?: string;
  /** As for `CynefinItem.markdown`. */
  readonly markdown?: true;
  /** `t:<from>><to>`; `#2`, … for a parallel repeat. */
  readonly ast: AstId;
}

export interface CynefinModel {
  /** Declared domains in the order of each name's first block. Undeclared domains are still drawn. */
  readonly domains: readonly CynefinDomain[];
  /** Transitions in source order, self-loops left out (D365). */
  readonly transitions: readonly CynefinTransition[];
  /** The in-text `title` if non-empty, else the front-matter `title` (D218); absent when neither. */
  readonly title?: string;
  /** Leading blanks stripped (v12 `commonDb.ts`). */
  readonly accTitle: string;
  /** `\n\s+` folded to `\n` (v12 `commonDb.ts`). */
  readonly accDescr: string;
  /** Warnings of the parse (also in `ParseResult.diagnostics`): `CYNEFIN_DUPLICATE_DOMAIN`, `CYNEFIN_SELF_LOOP`. */
  readonly warnings: readonly Diagnostic[];
}
