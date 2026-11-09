/**
 * Agentflow's shape vocabulary, from v12's `agentflow/shapes.ts` (`fa796a943`, D462) and the
 * shape names v12.2 accepts in `@{ shape }` (`rendering-elements/shapes.ts`, the list flowchart
 * v13 keeps; copied, never imported: D467).
 *
 * A vertex's v12 type (a bracket shape such as `square`, or a `@{ shape }` name) resolves
 * through {@link SHAPE_ALIASES}; the resolved name gives its kind ({@link vertexKind}) and the
 * shape it is drawn with ({@link drawnShape}). v12 drew a removed or unsupported shape as the
 * rounded default and reported it (`SHAPE_REMOVED`, `SHAPE_UNSUPPORTED`).
 */

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
const REMOVED_SHAPES: ReadonlySet<string> = /* @__PURE__ */ new Set(
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
const ALLOWED: ReadonlyMap<string, AgentflowShape> = /* @__PURE__ */ new Map([
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

/** The names v12 resolved to a tool (`SUBROUTINE_ALIASES`). */
const TOOLS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'subroutine',
  'subprocess',
  'subproc',
  'framed-rectangle',
  'tool',
]);

/** `shape` resolved through {@link SHAPE_ALIASES}. */
export function resolveShape(shape: string | undefined): string | undefined {
  return shape === undefined ? undefined : (SHAPE_ALIASES.get(shape) ?? shape);
}

/** v12 `deriveVertexKind`: a vertex's kind from its type, never from the drawn shape. */
export function vertexKind(type: string | undefined): VertexKind {
  if (type !== undefined && TOOLS.has(type)) return 'tool';
  const resolved = resolveShape(type);
  if (resolved === 'hexagon' || resolved === 'hex') return 'action';
  if (resolved === 'lean-right') return 'input';
  if (resolved === 'lin-doc' || resolved === 'lined-document') return 'refdoc';
  if (resolved === 'diamond') return 'decision';
  return 'task';
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

/** v12.2's shape names, aliases included, as `@{ shape }` accepts them. */
const SHAPE_NAMES =
  'rect proc process rectangle squareRect note rounded event roundedRect state stadium ' +
  'terminal pill fr-rect subprocess subproc framed-rectangle subroutine cyl db database ' +
  'cylinder circle circ diam decision diamond question hex hexagon prepare lean-r lean-right ' +
  'in-out lean_right lean-l lean-left out-in lean_left trap-b priority trapezoid-bottom ' +
  'trapezoid trap-t manual trapezoid-top inv-trapezoid inv_trapezoid dbl-circ double-circle ' +
  'doublecircle notch-rect card notched-rectangle lin-rect lined-rectangle lined-process ' +
  'lin-proc shaded-process sm-circ start small-circle stateStart fr-circ stop framed-circle ' +
  'stateEnd fork join forkJoin hourglass collate brace comment brace-l bolt com-link ' +
  'lightning-bolt doc document delay half-rounded-rectangle h-cyl das horizontal-cylinder ' +
  'lin-cyl disk lined-cylinder curv-trap curved-trapezoid display div-rect div-proc ' +
  'divided-rectangle divided-process tri extract triangle win-pane internal-storage ' +
  'window-pane f-circ junction filled-circle notch-pent loop-limit notched-pentagon flip-tri ' +
  'manual-file flipped-triangle sl-rect manual-input sloped-rectangle docs documents st-doc ' +
  'stacked-document st-rect procs processes stacked-rectangle bow-rect stored-data ' +
  'bow-tie-rectangle cross-circ summary crossed-circle tag-doc tagged-document tag-rect ' +
  'tagged-rectangle tag-proc tagged-process flag paper-tape odd rect_left_inv_arrow lin-doc ' +
  'lined-document datastore data-store folder directory bucket console browser person bang ' +
  'cloud text brace-r braces choice composite rectWithTitle labelRect block_arrow ' +
  'collapsedGroup iconSquare iconCircle icon iconRounded imageSquare anchor kanbanItem ' +
  'mindmapCircle defaultMindmapNode classBox erBox requirementBox usecaseActor ' +
  'usecaseActorHollow usecaseActorAwesome usecaseActorIcon usecaseBusiness usecaseEllipse ' +
  'usecaseJsonTable bpmn-start bpmn-intermediate bpmn-boundary bpmn-end bpmn-gateway ' +
  'bpmn-activity bpmn-data bpmn-data-store bpmn-annotation';

const SHAPES: ReadonlySet<string> = /* @__PURE__ */ new Set(SHAPE_NAMES.split(' '));

/** Whether v12's `isValidShape` knows the resolved name `name`. */
export function isValidShape(name: string): boolean {
  return SHAPES.has(name);
}
