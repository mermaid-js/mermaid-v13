/**
 * Agentflow's shape vocabulary, from v12's `agentflow/shapes.ts` (`fa796a943`, D462). The
 * shape names v12.2 accepts in `@{ shape }` (`rendering-elements/shapes.ts`) are the flow
 * family's, shared with flowchart (`@mermaid-js/shared/parser/flow`, D595).
 *
 * A vertex's v12 type (a bracket shape such as `square`, or a `@{ shape }` name) resolves
 * through {@link SHAPE_ALIASES}; the resolved name gives its kind ({@link vertexKind}) and the
 * shape it is drawn with ({@link drawnShape}). v12 drew a removed or unsupported shape as the
 * rounded default and reported it (`SHAPE_REMOVED`, `SHAPE_UNSUPPORTED`).
 */

import { isValidShape } from '@mermaid-js/shared/parser/flow';

export { isValidShape } from '@mermaid-js/shared/parser/flow';

/** v0.8.1's aliases (§4.3.2); `lean_right` is the fix after mermaid\@12.2.0 (D462). */
export const SHAPE_ALIASES: ReadonlyMap<string, string> = /* @__PURE__ */ new Map([
  ['task', 'roundedRect'],
  ['tool', 'subroutine'],
  ['input', 'lean-right'],
  ['lean_right', 'lean-right'],
  ['decision', 'diamond'],
  ['refdoc', 'lin-doc'],
  ['action', 'hexagon'],
  ['round', 'rect'],
]);

/** Shapes v0.8.1 removed (§4.3.3): drawn as the default, with `SHAPE_REMOVED`. */
export const REMOVED_SHAPES: ReadonlySet<string> = /* @__PURE__ */ new Set(
  (
    'doc stadium terminal circle trapezoid inv_trapezoid inv-trapezoid doublecircle ' +
    'double-circle typeDeclaration procs lean_left lean-left in-out cylinder ellipse odd ' +
    'tag-rect tagged-rectangle delay half-rounded-rectangle lin-rect lined-rectangle win-pane ' +
    'window-pane curv-trap curved-trapezoid'
  ).split(' ')
);

/** The shapes agentflow draws a vertex with (flowchart v13's names). */
export type AgentflowShape = 'rounded' | 'fr-rect' | 'lean-r' | 'diam' | 'lin-doc' | 'hex';

/** The shape each allowed resolved name is drawn with (v12's `ALLOWED_SHAPES`). */
export const ALLOWED: ReadonlyMap<string, AgentflowShape> = /* @__PURE__ */ new Map([
  ['roundedRect', 'rounded'],
  ['subroutine', 'fr-rect'],
  ['subprocess', 'fr-rect'],
  ['subproc', 'fr-rect'],
  ['framed-rectangle', 'fr-rect'],
  ['lean-right', 'lean-r'],
  ['diamond', 'diam'],
  ['lin-doc', 'lin-doc'],
  ['lined-document', 'lin-doc'],
  ['hexagon', 'hex'],
  ['hex', 'hex'],
]);

/** A vertex's kind (v12 `VertexKind`); a connector is its own kind. */
export type VertexKind = 'task' | 'tool' | 'input' | 'decision' | 'refdoc' | 'action' | 'connector';

/**
 * The kind of each drawn shape: v12's `deriveVertexKind` read the kind off the same allowed
 * names (its `SUBROUTINE_ALIASES` are {@link ALLOWED}'s `fr-rect` rows, with `tool`).
 */
const KIND: Readonly<Record<AgentflowShape, Exclude<VertexKind, 'connector'>>> = {
  rounded: 'task',
  'fr-rect': 'tool',
  'lean-r': 'input',
  diam: 'decision',
  'lin-doc': 'refdoc',
  hex: 'action',
};

/** `shape` resolved through {@link SHAPE_ALIASES}. */
export function resolveShape(shape: string | undefined): string | undefined {
  return shape === undefined ? undefined : (SHAPE_ALIASES.get(shape) ?? shape);
}

/**
 * v12 `deriveVertexKind`: a vertex's kind from its type, resolved through {@link ALLOWED}; a
 * type agentflow does not allow (removed, unsupported, or the `rect` default) is a task.
 */
export function vertexKind(type: string | undefined): VertexKind {
  const resolved = resolveShape(type);
  return KIND[(resolved !== undefined ? ALLOWED.get(resolved) : undefined) ?? 'rounded'];
}

/** How a vertex of a type is drawn, and why it is not drawn as written. */
export interface ShapeCheck {
  shape: AgentflowShape;
  /** The name v12's diagnostics quote. */
  name: string;
  problem?: 'removed' | 'unsupported';
}

/** v12 `getTypeFromVertex`, then `normaliseNodeShapes`. */
export function drawnShape(type: string | undefined): ShapeCheck {
  const resolved = resolveShape(type);
  const name = resolved === undefined || resolved === 'square' ? 'squareRect' : resolved;
  if (name === 'squareRect' || name === 'rect') return { shape: 'rounded', name };
  if (REMOVED_SHAPES.has(name)) return { shape: 'rounded', name, problem: 'removed' };
  const allowed = ALLOWED.get(name);
  return allowed === undefined
    ? { shape: 'rounded', name, problem: 'unsupported' }
    : { shape: allowed, name };
}

/**
 * Whether `@{ shape: name }` takes `name` without `UNKNOWN_SHAPE`: lower case, no `_` (v12's
 * rule, as `dataShape` in `model.ts` checks it), and a shape v12 knows once its alias resolves.
 */
export function acceptsDataShape(name: string): boolean {
  return name === name.toLowerCase() && !name.includes('_') && isValidShape(resolveShape(name)!);
}

/**
 * The id v12 reserves for its connectors pseudo-flow: a mention of it makes no node
 * (`AGENTFLOW_RESERVED_ID`) unless a `connector connectors` or `flow connectors` takes it (D464).
 */
export const RESERVED_ID = 'connectors';
