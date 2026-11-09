/**
 * The architecture model as v12's DB built it (`architectureDb.ts`, `architectureParser.ts`):
 * every group, then every service, junction, edge and alignment, each kind in source order, run
 * through v12's checks. Each check v12 threw from is an error diagnostic with v12's message
 * (D504's group-id edge end takes Pele's), placed on the id it is about, and the model goes on
 * (R-PARSE-4):
 *
 * - a second declaration of an id is left out; the first stays;
 * - a service, junction or group whose parent is itself, unknown or not a group is kept without a
 *   parent, so the edges and alignments that name it raise no second error;
 * - an edge or alignment that fails a check is left out.
 *
 * An id whose declaration had a syntax error ({@link ArchitectureParts.broken}) raises no "does
 * not exist" error either, for the same reason. `{group}` on an end in no group is ignored with
 * one `ARCHITECTURE_GROUP_EDGE_UNGROUPED` warning (D504).
 */
import type { AstId, Diagnostics, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import {
  ARCHITECTURE_ALIGN_MEMBER,
  ARCHITECTURE_ALIGN_REPEAT,
  ARCHITECTURE_ALIGN_SHORT,
  ARCHITECTURE_DUPLICATE_ID,
  ARCHITECTURE_GROUP_EDGE_END,
  ARCHITECTURE_GROUP_EDGE_SAME_GROUP,
  ARCHITECTURE_GROUP_EDGE_UNGROUPED,
  ARCHITECTURE_PARENT_NOT_GROUP,
  ARCHITECTURE_SELF_PARENT,
  ARCHITECTURE_UNKNOWN_ID,
  ARCHITECTURE_UNKNOWN_PARENT,
} from '../codes.ts';
import type {
  ArchitectureAlignment,
  ArchitectureEdge,
  ArchitectureGroup,
  ArchitectureJunction,
  ArchitectureModel,
  ArchitectureService,
} from '../model.ts';
import type {
  ArchitectureAlignmentNode,
  ArchitectureEdgeEnd,
  ArchitectureEdgeNode,
  ArchitectureGroupNode,
  ArchitectureJunctionNode,
  ArchitectureServiceNode,
} from './ast.ts';

/** What a declaration declares, in v12's words. */
export type DeclarationKind = 'service' | 'junction' | 'group';

/** A failed check: v12's message, its code, and which id of the statement it is about. */
export interface Problem {
  readonly code: string;
  readonly message: string;
  /** `id` (the declared id), `parent`, `lhs`, `rhs`, or a member's index in an alignment. */
  readonly at: 'id' | 'parent' | 'lhs' | 'rhs' | number;
}

/** What {@link ArchitectureRegistry.add} did. */
export interface Added {
  /** The first check that failed, if any. */
  readonly problem?: Problem;
  /** Whether the id was registered (false only when it was taken). */
  readonly added: boolean;
  /** The parent registered with it: `undefined` for none or when its check failed. */
  readonly parent: string | undefined;
}

/**
 * v12's `ArchitectureDB` checks, in its order, over its id table (a `Map`, so `__proto__` is an
 * id like any other). Each check returns the first one that failed, or `undefined`: v12 threw
 * that check's message and stopped. Unlike v12's DB, a declaration whose parent check fails is
 * still registered, without its parent (see the module comment).
 */
export class ArchitectureRegistry {
  private readonly ids = new Map<string, 'node' | 'group'>();
  /** Each service's and junction's group (`undefined`: none). */
  private readonly parents = new Map<string, string | undefined>();

  /** v12's `addService`, `addJunction` and `addGroup` (one shape, the kind in the message). */
  add(kind: DeclarationKind, id: string, parent: string | undefined): Added {
    const known = this.ids.get(id);
    if (known !== undefined) {
      const taken = problem(
        ARCHITECTURE_DUPLICATE_ID,
        `The ${kind} id [${id}] is already in use by another ${known}`,
        'id'
      );
      return { problem: taken, added: false, parent: undefined };
    }
    const failed = parent === undefined ? undefined : this.parentProblem(kind, id, parent);
    const kept = failed ? undefined : parent;
    this.ids.set(id, kind === 'group' ? 'group' : 'node');
    if (kind !== 'group') this.parents.set(id, kept);
    return failed ? { problem: failed, added: true, parent: kept } : { added: true, parent: kept };
  }

  private parentProblem(kind: DeclarationKind, id: string, parent: string): Problem | undefined {
    if (id === parent) {
      return problem(
        ARCHITECTURE_SELF_PARENT,
        `The ${kind} [${id}] cannot be placed within itself`,
        'parent'
      );
    }
    const of = this.ids.get(parent);
    if (of === undefined) {
      return problem(
        ARCHITECTURE_UNKNOWN_PARENT,
        `The ${kind} [${id}]'s parent does not exist. Please make sure the parent is created before this ${kind}`,
        'parent'
      );
    }
    if (of === 'node') {
      return problem(
        ARCHITECTURE_PARENT_NOT_GROUP,
        `The ${kind} [${id}]'s parent is not a group`,
        'parent'
      );
    }
    return undefined;
  }

  /** Whether `id` is registered (as anything). */
  has(id: string): boolean {
    return this.ids.has(id);
  }

  /** The group of the service or junction `id`, if any. */
  groupOf(id: string): string | undefined {
    return this.parents.get(id);
  }

  /**
   * v12's `addEdge` checks: both ends exist (left, then right), neither is a group (D504; v12
   * read `.in` off the missing node and threw a `TypeError`), and a `{group}` end does not stay
   * inside the one group both ends share.
   */
  edge(lhs: string, rhs: string, lhsGroup: boolean, rhsGroup: boolean): Problem | undefined {
    for (const [side, id] of [
      ['left', lhs],
      ['right', rhs],
    ] as const) {
      if (!this.ids.has(id)) {
        return problem(
          ARCHITECTURE_UNKNOWN_ID,
          `The ${side}-hand id [${id}] does not yet exist. Please create the service/group before declaring an edge to it.`,
          side === 'left' ? 'lhs' : 'rhs'
        );
      }
    }
    for (const [side, id] of [
      ['left', lhs],
      ['right', rhs],
    ] as const) {
      if (this.ids.get(id) === 'group') {
        return problem(
          ARCHITECTURE_GROUP_EDGE_END,
          `The ${side}-hand id [${id}] is a group. Add {group} to a service inside it instead.`,
          side === 'left' ? 'lhs' : 'rhs'
        );
      }
    }
    const a = this.parents.get(lhs);
    const b = this.parents.get(rhs);
    if (a === undefined || a !== b) return undefined;
    for (const [side, id, crosses] of [
      ['left', lhs, lhsGroup],
      ['right', rhs, rhsGroup],
    ] as const) {
      if (crosses) {
        return problem(
          ARCHITECTURE_GROUP_EDGE_SAME_GROUP,
          `The ${side}-hand id [${id}] is modified to traverse the group boundary, but the edge does not pass through two groups.`,
          side === 'left' ? 'lhs' : 'rhs'
        );
      }
    }
    return undefined;
  }

  /** v12's `addLayoutHint` checks: two members or more, each a service or junction, each once. */
  align(direction: 'row' | 'column', members: readonly string[]): Problem | undefined {
    if (members.length < 2) {
      return problem(
        ARCHITECTURE_ALIGN_SHORT,
        `An align directive requires at least two members; got ${members.length}`,
        0
      );
    }
    return this.members(direction, members);
  }

  /** {@link align}'s checks of each member: a service or junction, listed once. */
  members(direction: 'row' | 'column', members: readonly string[]): Problem | undefined {
    const seen = new Set<string>();
    for (let k = 0; k < members.length; k++) {
      const id = members[k] ?? '';
      if (this.ids.get(id) !== 'node') {
        return problem(
          ARCHITECTURE_ALIGN_MEMBER,
          `align ${direction} references [${id}], which is not a service or junction`,
          k
        );
      }
      if (seen.has(id)) {
        return problem(
          ARCHITECTURE_ALIGN_REPEAT,
          `align ${direction} lists [${id}] more than once`,
          k
        );
      }
      seen.add(id);
    }
    return undefined;
  }
}

const problem = (code: string, message: string, at: Problem['at']): Problem => ({
  code,
  message,
  at,
});

/** What the parser read, for {@link normalise}. */
export interface ArchitectureParts {
  readonly groups: readonly ArchitectureGroupNode[];
  readonly services: readonly ArchitectureServiceNode[];
  readonly junctions: readonly ArchitectureJunctionNode[];
  readonly edges: readonly ArchitectureEdgeNode[];
  readonly alignments: readonly ArchitectureAlignmentNode[];
  /** Ids declared by a statement with a syntax error: no "does not exist" error for them. */
  readonly broken: ReadonlySet<string>;
  /** The last in-text values ('' when none). */
  readonly title: string;
  readonly titleAstId: AstId | undefined;
  readonly accTitle: string;
  readonly accDescr: string;
  /** The front-matter title, for D218. */
  readonly frontMatterTitle: string | undefined;
}

/** Each registered id: its kind and the AST id of the declaration that registered it. */
export type Registered = ReadonlyMap<string, { kind: DeclarationKind; astId: AstId }>;

/** The resolved model (without `warnings`), and who registered each id (for the symbols). */
export interface Normalised {
  model: Omit<ArchitectureModel, 'warnings'>;
  registered: Registered;
}

/** Errors and the warning go to `diagnostics`; the caller sorts them and fills `warnings`. */
export function normalise(parts: ArchitectureParts, diagnostics: Diagnostics): Normalised {
  return new Normaliser(parts, diagnostics).run();
}

type Declaration = ArchitectureGroupNode | ArchitectureServiceNode | ArchitectureJunctionNode;

class Normaliser {
  private readonly db = new ArchitectureRegistry();
  private readonly registered = new Map<string, { kind: DeclarationKind; astId: AstId }>();
  /** Ids registered without the parent they named (the parent check failed). */
  private readonly parentDropped = new Set<string>();
  /** `{group}` ends in no group (D504), for one warning. */
  private readonly ungrouped: { range: Range; id: string; astId: AstId }[] = [];

  constructor(
    private readonly parts: ArchitectureParts,
    private readonly diagnostics: Diagnostics
  ) {}

  run(): Normalised {
    const { parts } = this;
    // v12's order: every group, then services, junctions, edges and alignments.
    const groups = this.groups();
    const services = this.services();
    const junctions = this.junctions();
    const edges: ArchitectureEdge[] = [];
    for (const n of parts.edges) {
      const edge = this.edge(n);
      if (edge) edges.push(edge);
    }
    const alignments = this.alignments();
    this.flushUngrouped();
    // D218: the in-text title if non-empty, else the front-matter one.
    const title = parts.title || parts.frontMatterTitle;
    const model: Omit<ArchitectureModel, 'warnings'> = {
      groups: freeze(groups),
      services: freeze(services),
      junctions: freeze(junctions),
      edges: freeze(edges),
      alignments: freeze(alignments),
      ...(title ? { title } : {}),
      ...(parts.title && parts.titleAstId !== undefined ? { titleAstId: parts.titleAstId } : {}),
      accTitle: parts.accTitle,
      accDescr: parts.accDescr,
    };
    return { model, registered: this.registered };
  }

  private groups(): ArchitectureGroup[] {
    const out: ArchitectureGroup[] = [];
    for (const n of this.parts.groups) {
      const parent = this.declare('group', n);
      if (parent === null) continue;
      out.push(
        freeze({
          id: n.name.value,
          ...(n.icon && { icon: n.icon.value }),
          ...(n.label && { title: n.label.value }),
          ...(parent !== undefined && { in: parent }),
          astId: n.id,
        })
      );
    }
    return out;
  }

  private services(): ArchitectureService[] {
    const out: ArchitectureService[] = [];
    for (const n of this.parts.services) {
      const parent = this.declare('service', n);
      if (parent === null) continue;
      out.push(
        freeze({
          id: n.name.value,
          ...(n.icon && { icon: n.icon.value }),
          ...(n.iconText && { iconText: n.iconText.value }),
          ...(n.label && { title: n.label.value }),
          ...(parent !== undefined && { in: parent }),
          astId: n.id,
        })
      );
    }
    return out;
  }

  private junctions(): ArchitectureJunction[] {
    const out: ArchitectureJunction[] = [];
    for (const n of this.parts.junctions) {
      const parent = this.declare('junction', n);
      if (parent === null) continue;
      out.push(
        freeze({ id: n.name.value, ...(parent !== undefined && { in: parent }), astId: n.id })
      );
    }
    return out;
  }

  /**
   * v12's `addLayoutHint` for each `align`; one that fails a check is left out. A member whose
   * declaration had a syntax error raises no error, and the others are still checked.
   */
  private alignments(): ArchitectureAlignment[] {
    const out: ArchitectureAlignment[] = [];
    for (const n of this.parts.alignments) {
      const checked = n.members.filter((m) => !this.isBroken(m.value));
      const broken = checked.length < n.members.length;
      const members = checked.map((m) => m.value);
      const failed = broken
        ? this.db.members(n.direction, members)
        : this.db.align(n.direction, members);
      if (failed) {
        const at = typeof failed.at === 'number' ? checked[failed.at] : undefined;
        this.error(failed, at?.range ?? n.range);
      }
      if (failed || broken) continue;
      out.push(freeze({ direction: n.direction, members: freeze(members), astId: n.id }));
    }
    return out;
  }

  /** Whether `id` was declared only by a statement with a syntax error. */
  private isBroken(id: string): boolean {
    return this.parts.broken.has(id) && !this.db.has(id);
  }

  /**
   * Register a declaration: its parent once the checks pass (`undefined` for none), or `null`
   * when its id was taken (it is left out).
   */
  private declare(kind: DeclarationKind, n: Declaration): string | undefined | null {
    const id = n.name.value;
    const { problem: failed, added, parent: kept } = this.db.add(kind, id, n.parent?.value);
    if (failed?.at === 'parent') this.parentDropped.add(id);
    if (failed) {
      const parent = n.parent;
      // A parent whose own declaration had a syntax error: no second error.
      const quiet =
        failed.code === ARCHITECTURE_UNKNOWN_PARENT &&
        parent !== undefined &&
        this.parts.broken.has(parent.value);
      if (!quiet)
        this.error(failed, failed.at === 'parent' && parent ? parent.range : n.name.range);
    }
    if (!added) return null;
    this.registered.set(id, { kind, astId: n.id });
    return kept;
  }

  private edge(n: ArchitectureEdgeNode): ArchitectureEdge | undefined {
    const { lhs, rhs } = n;
    if (this.isBroken(lhs.name.value) || this.isBroken(rhs.name.value)) {
      // An end whose declaration had a syntax error: no error for it, but the other end is
      // still checked; the edge is left out.
      const other = this.isBroken(lhs.name.value) ? rhs : lhs;
      if (!this.isBroken(other.name.value) && !this.db.has(other.name.value)) {
        const side = other === lhs ? 'left' : 'right';
        this.diagnostics.error(
          ARCHITECTURE_UNKNOWN_ID,
          `The ${side}-hand id [${other.name.value}] does not yet exist. Please create the service/group before declaring an edge to it.`,
          other.name.range
        );
      }
      return undefined;
    }
    const failed = this.db.edge(
      lhs.name.value,
      rhs.name.value,
      lhs.group !== undefined,
      rhs.group !== undefined
    );
    if (failed) {
      this.error(failed, (failed.at === 'lhs' ? lhs : rhs).name.range);
      return undefined;
    }
    return freeze({
      lhsId: lhs.name.value,
      lhsDir: lhs.side,
      lhsInto: lhs.into,
      lhsGroup: this.groupFlag(lhs, n.id),
      rhsId: rhs.name.value,
      rhsDir: rhs.side,
      rhsInto: rhs.into,
      rhsGroup: this.groupFlag(rhs, n.id),
      ...(n.label && { title: n.label.value }),
      astId: n.id,
    });
  }

  /** An end's `{group}`: kept when its id is in a group, else ignored with the warning (D504). */
  private groupFlag(end: ArchitectureEdgeEnd, astId: AstId): boolean {
    if (end.group === undefined) return false;
    if (this.db.groupOf(end.name.value) !== undefined) return true;
    // Its `in` failed and was reported: no second diagnostic.
    if (this.parentDropped.has(end.name.value)) return false;
    this.ungrouped.push({ range: end.group, id: end.name.value, astId });
    return false;
  }

  /** D504: one `ARCHITECTURE_GROUP_EDGE_UNGROUPED` at the first place, the others in `related`. */
  private flushUngrouped(): void {
    const [first, ...rest] = this.ungrouped;
    if (!first) return;
    const why = (id: string) =>
      `\`{group}\` after \`${id}\` is ignored: \`${id}\` is in no group, so the edge has no group border to meet`;
    const related: RelatedInfo[] = rest.map((r) => ({ message: why(r.id), range: r.range }));
    const d = this.diagnostics.warning(
      ARCHITECTURE_GROUP_EDGE_UNGROUPED,
      `${why(first.id)}. Put \`${first.id}\` in a group with \`in\`, or drop the \`{group}\`.`,
      first.range,
      related.length > 0 ? { related } : undefined
    );
    Object.assign(d, { astIds: [...new Set(this.ungrouped.map((r) => r.astId))] });
  }

  private error(p: Problem, range: Range): void {
    this.diagnostics.error(p.code, p.message, range);
  }
}

function freeze<T extends object>(value: T): T {
  return Object.freeze(value);
}
