/**
 * v12.2's `shapesDefs`: each shape's short name first, then its aliases and internal aliases.
 * The renderer draws the first name of each group.
 */
export const SHAPE_GROUPS: readonly (readonly string[])[] = [
  ['rect', 'proc', 'process', 'rectangle', 'squareRect', 'note'],
  ['rounded', 'event', 'roundedRect', 'state'],
  ['stadium', 'terminal', 'pill'],
  ['fr-rect', 'subprocess', 'subproc', 'framed-rectangle', 'subroutine'],
  ['cyl', 'db', 'database', 'cylinder'],
  ['circle', 'circ'],
  ['diam', 'decision', 'diamond', 'question'],
  ['hex', 'hexagon', 'prepare'],
  ['lean-r', 'lean-right', 'in-out', 'lean_right'],
  ['lean-l', 'lean-left', 'out-in', 'lean_left'],
  ['trap-b', 'priority', 'trapezoid-bottom', 'trapezoid'],
  ['trap-t', 'manual', 'trapezoid-top', 'inv-trapezoid', 'inv_trapezoid'],
  ['dbl-circ', 'double-circle', 'doublecircle'],
  ['notch-rect', 'card', 'notched-rectangle'],
  ['lin-rect', 'lined-rectangle', 'lined-process', 'lin-proc', 'shaded-process'],
  ['sm-circ', 'start', 'small-circle', 'stateStart'],
  ['fr-circ', 'stop', 'framed-circle', 'stateEnd'],
  ['fork', 'join', 'forkJoin'],
  ['hourglass', 'collate'],
  ['brace', 'comment', 'brace-l'],
  ['bolt', 'com-link', 'lightning-bolt'],
  ['doc', 'document'],
  ['delay', 'half-rounded-rectangle'],
  ['h-cyl', 'das', 'horizontal-cylinder'],
  ['lin-cyl', 'disk', 'lined-cylinder'],
  ['curv-trap', 'curved-trapezoid', 'display'],
  ['div-rect', 'div-proc', 'divided-rectangle', 'divided-process'],
  ['tri', 'extract', 'triangle'],
  ['win-pane', 'internal-storage', 'window-pane'],
  ['f-circ', 'junction', 'filled-circle'],
  ['notch-pent', 'loop-limit', 'notched-pentagon'],
  ['flip-tri', 'manual-file', 'flipped-triangle'],
  ['sl-rect', 'manual-input', 'sloped-rectangle'],
  ['docs', 'documents', 'st-doc', 'stacked-document'],
  ['st-rect', 'procs', 'processes', 'stacked-rectangle'],
  ['bow-rect', 'stored-data', 'bow-tie-rectangle'],
  ['cross-circ', 'summary', 'crossed-circle'],
  ['tag-doc', 'tagged-document'],
  ['tag-rect', 'tagged-rectangle', 'tag-proc', 'tagged-process'],
  ['flag', 'paper-tape'],
  ['odd', 'rect_left_inv_arrow'],
  ['lin-doc', 'lined-document'],
  ['datastore', 'data-store'],
  ['folder', 'directory'],
];

/** Undocumented shapes v12 accepts by name (`rendering-elements/shapes.ts`). */
const UNDOCUMENTED =
  'bucket console browser person bang cloud text brace-r braces choice composite rectWithTitle ' +
  'labelRect block_arrow collapsedGroup iconSquare iconCircle icon iconRounded imageSquare ' +
  'anchor kanbanItem mindmapCircle defaultMindmapNode classBox erBox requirementBox ' +
  'usecaseActor usecaseActorHollow usecaseActorAwesome usecaseActorIcon usecaseBusiness ' +
  'usecaseEllipse usecaseJsonTable bpmn-start bpmn-intermediate bpmn-boundary bpmn-end ' +
  'bpmn-gateway bpmn-activity bpmn-data bpmn-data-store bpmn-annotation';

const SHAPES: ReadonlySet<string> = /* @__PURE__ */ new Set([
  ...SHAPE_GROUPS.flat(),
  ...UNDOCUMENTED.split(' '),
]);

/** Whether `@{ shape: name }` names a shape v12 accepts. */
export function isValidShape(name: string): boolean {
  return SHAPES.has(name);
}

/**
 * Whether `@{ shape: name }` is accepted as written: a name v12 knows, lowercase, without `_`
 * (the model reports `UNKNOWN_SHAPE` for the others).
 */
export function acceptedShape(name: string): boolean {
  return isValidShape(name) && name === name.toLowerCase() && !name.includes('_');
}
