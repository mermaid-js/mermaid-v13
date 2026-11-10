/**
 * The architecture model (spec #525): what the parser (#599) produces and the layout (#607) and
 * renderer (#614) read. Plain, frozen data. Shared contract of the architecture tickets: change
 * it only additively, and say so in the run notes (`v13/docs/agents/runs/525/GAPS.md`).
 *
 * Each list is in source order, which is also v12's insertion order (its DB added every group,
 * then every service, junction, edge and alignment, each kind in source order); the layout
 * reads them in that order. Only what v12's DB accepted is here: a statement with a syntax error
 * is left out, and so is one v12's DB rejected, except that a service, junction or group whose
 * parent is wrong is kept without a parent, so the edges to it raise no second error.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** An edge end's side: left, right, top or bottom. */
export type ArchitectureSide = 'L' | 'R' | 'T' | 'B';

/** `service id(icon)[Label] in group`, or `service id "text"[Label]`. */
export interface ArchitectureService {
  /** The id as written (ASCII `\w` and `-`). */
  readonly id: string;
  /** The icon's name without its parentheses (`database`, `logos:aws`); absent when none. */
  readonly icon?: string;
  /** A text icon's text, unquoted and unescaped; absent when none. */
  readonly iconText?: string;
  /** The `[…]` label after v12's conversion (trimmed, one pair of quotes off); absent when none. */
  readonly title?: string;
  /** The group it is in; absent when none. */
  readonly in?: string;
  /** `service:<id>`: the AST id of the declaration that registered it (pitfall 9, D508). */
  readonly astId: AstId;
}

/** `junction id in group`. */
export interface ArchitectureJunction {
  readonly id: string;
  readonly in?: string;
  /** `junction:<id>`. */
  readonly astId: AstId;
}

/** `group id(icon)[Label] in parent`. */
export interface ArchitectureGroup {
  readonly id: string;
  readonly icon?: string;
  readonly title?: string;
  /** The parent group, declared before it. */
  readonly in?: string;
  /** `group:<id>`. */
  readonly astId: AstId;
}

/** `lhs{group}:R <-[label]-> L:rhs{group}`, field names as in v12's DB. */
export interface ArchitectureEdge {
  readonly lhsId: string;
  readonly lhsDir: ArchitectureSide;
  /** An arrowhead at the left-hand end (`<` or `>` next to it). */
  readonly lhsInto: boolean;
  /**
   * `{group}` after the left-hand id: the edge meets the border of its group. False when the
   * id is in no group (D504, `ARCHITECTURE_GROUP_EDGE_UNGROUPED`), where v12 kept it.
   */
  readonly lhsGroup: boolean;
  readonly rhsId: string;
  readonly rhsDir: ArchitectureSide;
  readonly rhsInto: boolean;
  readonly rhsGroup: boolean;
  /** The `-[label]-` label, converted as a service's; absent for `--`. */
  readonly title?: string;
  /** `edge:<lhs>-><rhs>`, a repeat of the pair `@2`, … (D508). */
  readonly astId: AstId;
}

/** `align row a b c` or `align column a b`. */
export interface ArchitectureAlignment {
  readonly direction: 'row' | 'column';
  /** Services and junctions, at least two, each once. */
  readonly members: readonly string[];
  /** `align:<n>`, n from 1 in source order (D508). */
  readonly astId: AstId;
}

export interface ArchitectureModel {
  readonly groups: readonly ArchitectureGroup[];
  readonly services: readonly ArchitectureService[];
  readonly junctions: readonly ArchitectureJunction[];
  readonly edges: readonly ArchitectureEdge[];
  readonly alignments: readonly ArchitectureAlignment[];
  /**
   * The in-text `title` if non-empty, else the front-matter `title` (D218); absent when neither.
   * Kept for accessibility tools; v12 never drew it, and v13 does not either.
   */
  readonly title?: string;
  /** The AST id of the `title` statement the title comes from; absent otherwise. */
  readonly titleAstId?: AstId;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
