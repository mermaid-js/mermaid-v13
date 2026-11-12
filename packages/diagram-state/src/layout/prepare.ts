// StateModel → LayoutGraph (DESIGN §6.1): measures every state, pseudo-state and note with the
// injected measurer before layout. Composites are titled groups, each concurrency region a
// title-less group in its composite (#140, `research/state-regions.md`), and a note is a node
// joined to its state by an edge. Every length comes from the unit profile (ADR-13, D77): the
// shared builder metrics, plus state's own shape table (D108, `metrics.ts`).
import type { Dir, LayoutGraph, LayoutGroup, LayoutNode } from '@mermaid-js/core/layout';
import { fromPx, pxProfile, type UnitProfile } from '@mermaid-js/core/layout';
import { checkStyle, type CheckedStyle } from '@mermaid-js/core/svg';
import {
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import type { StateModel, StateNode, StateNote, StateTransition } from '../parser/index.ts';
import { configLengths, type ConfigLength } from './config-length.ts';
import type { StateRenderContext } from './context.ts';
import { stateConfigDefaults } from '../generated/config-defaults.ts';
import { stateMetrics, type StateMetrics } from './metrics.ts';
import type { BlockShapes, EmbeddedDiagram } from '@mermaid-js/core';

/** What a node is drawn as. `described`: a state with several description lines (v12 `rectWithTitle`). */
export type StateShape =
  | 'state'
  | 'described'
  | 'start'
  | 'end'
  | 'choice'
  | 'fork'
  | 'join'
  | 'note'
  /** An embedded diagram block (ADR-15): a frame, a title strip, the inner diagram. */
  | 'embed';

export interface StateNodeView {
  /** Layout node id: the state id, or the note's AST id (`note:<k>`). */
  id: string;
  ast: string;
  shape: StateShape;
  /** The label; a described state's title (its id). */
  label: MeasuredLabel;
  /** A described state's description lines, below its title. */
  rows?: MeasuredLabel;
  w: number;
  h: number;
  /** The composite or region it sits in. */
  parent?: string;
  /** The direction its scope is laid out in (a crossing edge drops a group's own, as in v12). */
  flow: Dir;
  style: CheckedStyle;
  state?: StateNode;
  note?: StateNote;
  /** An embedded diagram block (ADR-15), drawn in its frame or folded (#670); absent otherwise. */
  block?: 'embed' | 'folded';
  /** An unfolded block: what it holds, `null` for a stand-in frame. */
  embed?: EmbeddedDiagram | null;
  /** A folded block (#670): its inner type (empty when unknown) and that type's label. */
  fold?: { readonly type: string; readonly label: MeasuredLabel };
}

export interface StateGroupView {
  id: string;
  ast: string;
  /** A concurrency region (no title, no border of its own; T4 draws dividers between them). */
  region: boolean;
  /** A composite's title; empty for a region. */
  label: MeasuredLabel;
  parent?: string;
  /** Nesting depth (0 at the top). */
  depth: number;
  flow: Dir;
  style: CheckedStyle;
  state?: StateNode;
}

export interface StateEdgeView {
  /** Layout edge id: the transition's (`edge<n>`), or `<from>-<to>` for a note's. */
  id: string;
  ast: string;
  source: string;
  target: string;
  label: MeasuredLabel;
  /** A note's dashed connector (no arrowhead, no label). */
  note: boolean;
  transition?: StateTransition;
}

export interface StatePrepared {
  graph: LayoutGraph;
  nodes: StateNodeView[];
  /** Composites and regions, outermost first. */
  groups: StateGroupView[];
  edges: StateEdgeView[];
  views: ReadonlyMap<string, StateNodeView | StateGroupView>;
  /** A composite's regions in declaration order, for each composite that has any. */
  regions: ReadonlyMap<string, readonly string[]>;
}

const sideways = (d: Dir): boolean => d === 'LR' || d === 'RL';

function textStyle(style: CheckedStyle, font: FontKey): [FontKey, number] {
  const t = style.text;
  const weight = t['font-weight'];
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  const bits = (bold ? Style.Bold : 0) | (t['font-style'] === 'italic' ? Style.Italic : 0);
  const size = fontSizePx(t['font-size'], font.size);
  return [size !== undefined && size > 0 && size < 1000 ? { ...font, size } : font, bits];
}

/** The text a state is labelled with: its one description, else its id. */
const labelText = (s: StateNode): string =>
  s.descriptions.length === 1 ? s.descriptions[0]! : s.id;

interface Measure {
  readonly units: UnitProfile;
  readonly sm: StateMetrics;
  readonly cells: boolean;
  readonly font: FontKey;
  /** State label wrap width and least label width, in units. */
  readonly wrap: number;
  readonly minWidth: number;
  readonly label: (text: string, style: CheckedStyle, max: number) => MeasuredLabel;
  readonly styleOf: (classes: readonly string[], own?: readonly string[]) => CheckedStyle;
  readonly embed: StateRenderContext['embed'];
  /** A folded block's type label (#670): one line, `size` px. */
  readonly typeLabel: (text: string, size: number) => MeasuredLabel;
  readonly foldedType: StateRenderContext['foldedType'];
  /** Core's block shapes (D554); without them a block is a plain state. */
  readonly shapes: BlockShapes | undefined;
}

/**
 * Measures the model and builds the graph the layout engine gets. A transition to a composite
 * ends at its group; a note sits in its state's scope, on the asked side along the flow (the
 * engine has no same-rank constraint, so in a TB drawing `right of` puts it below the state and
 * `left of` above).
 */
export function prepareState(model: StateModel, ctx: StateRenderContext): StatePrepared {
  const units = ctx.units ?? pxProfile;
  const b = units.builder;
  const cfg = ctx.config.state ?? {};
  const length = configLengths(cfg, stateConfigDefaults, (w) => ctx.warn(w));
  const m: Measure = {
    units,
    sm: stateMetrics(units),
    cells: units.id === 'cell',
    font: {
      family: ctx.theme.value('fontFamily'),
      size: ctx.theme.number('fontSize'),
      weight: 400,
    },
    wrap: fromPx(units, length('wrappingWidth') ?? stateConfigDefaults.wrappingWidth!, 'x'),
    minWidth: fromPx(units, length('minNodeWidth') ?? stateConfigDefaults.minNodeWidth!, 'x'),
    label: (text, style, max) => {
      const [f, bits] = textStyle(style, m.font);
      // v12 gives every state, note and transition label `labelType: 'markdown'`.
      return layoutLabel(text, f, max, ctx.measurer, {
        markdown: true,
        style: bits,
        inline: ctx.inline,
      });
    },
    styleOf: styleCache(model, ctx),
    embed: ctx.embed,
    typeLabel: (text, size) => layoutLabel(text, { ...m.font, size }, Infinity, ctx.measurer),
    foldedType: ctx.foldedType,
    shapes: ctx.blockShapes,
  };

  const sc = scopes(model);
  const { regionsOf, groupAst, groupDir, parentOf, flowOf, depthOf, notes, transitions } = sc;

  // ---- views ------------------------------------------------------------------------------
  const views = new Map<string, StateNodeView | StateGroupView>();
  const nodes: StateNodeView[] = [];
  const groups: StateGroupView[] = [];
  const empty = m.label('', m.styleOf([]), 0);
  for (const s of model.states) {
    const style = m.styleOf(s.classes, s.styles);
    if (s.kind === 'composite') {
      const view: StateGroupView = {
        id: s.id,
        ast: s.ast,
        region: false,
        label: m.label(labelText(s), style, Infinity),
        parent: parentOf(s.id),
        depth: depthOf(s.id),
        flow: flowOf(s.id),
        style,
        state: s,
      };
      groups.push(view);
      views.set(s.id, view);
      for (const r of regionsOf.get(s.id) ?? []) {
        const rv: StateGroupView = {
          id: r,
          ast: groupAst.get(r)!,
          region: true,
          label: empty,
          parent: s.id,
          depth: depthOf(r),
          flow: flowOf(r),
          style,
        };
        groups.push(rv);
        views.set(r, rv);
      }
      continue;
    }
    const parent = parentOf(s.id);
    const view = measureState(s, style, parent, flowOf(parent), m);
    nodes.push(view);
    views.set(s.id, view);
  }
  for (const { note } of notes) {
    const parent = parentOf(note.ast);
    const style = m.styleOf([]);
    const label = m.label(note.text, style, b.wrapWidth);
    const view: StateNodeView = {
      id: note.ast,
      ast: note.ast,
      shape: 'note',
      label,
      ...boxOf(label, m.sm.notePad, m),
      parent,
      flow: flowOf(parent),
      style,
      note,
    };
    nodes.push(view);
    views.set(view.id, view);
  }
  groups.sort((g, h) => g.depth - h.depth);

  const edges: StateEdgeView[] = [
    ...transitions.map(
      (t): StateEdgeView => ({
        id: t.id,
        ast: t.ast,
        source: t.from,
        target: t.to,
        label: m.label(t.label, m.styleOf([]), b.edgeWrap),
        note: false,
        transition: t,
      })
    ),
    ...notes.map(
      (n): StateEdgeView => ({
        id: n.id,
        ast: n.note.ast,
        source: n.from,
        target: n.to,
        label: empty,
        note: true,
      })
    ),
  ];
  const graph = layoutGraph(model, { nodes, groups, edges }, regionsOf, groupDir, m, length);
  return { graph, nodes, groups, edges, views, regions: regionsOf };
}

/** A note's node and the edge that joins it to its state. */
interface NoteEdge {
  note: StateNote;
  id: string;
  from: string;
  to: string;
}

/** Group membership, the drawn edges' ends, and the direction each scope is laid out in. */
function scopes(model: StateModel) {
  // ---- structure: groups, parents, edge ends --------------------------------------------
  const regionsOf = new Map<string, string[]>();
  const groupParent = new Map<string, string | undefined>();
  const groupDir = new Map<string, Dir | undefined>();
  const groupAst = new Map<string, string>();
  for (const s of model.states) {
    if (s.kind !== 'composite') continue;
    groupParent.set(s.id, s.parent);
    // v12's `getDir` gives a composite with no `direction` of its own TB (DEFAULT_NESTED_DOC_DIR).
    groupDir.set(s.id, s.dir ?? 'TB');
    groupAst.set(s.id, s.ast);
  }
  for (const r of model.regions) {
    if (!groupParent.has(r.parent)) continue;
    groupParent.set(r.id, r.parent);
    groupDir.set(r.id, r.dir);
    groupAst.set(r.id, r.ast);
    let list = regionsOf.get(r.parent);
    if (!list) regionsOf.set(r.parent, (list = []));
    list.push(r.id);
  }
  const inGroup = (p: string | undefined): string | undefined =>
    p !== undefined && groupParent.has(p) ? p : undefined;
  const nodeParent = new Map<string, string | undefined>();
  for (const s of model.states) if (s.kind !== 'composite') nodeParent.set(s.id, inGroup(s.parent));
  const parentOf = (id: string): string | undefined =>
    groupParent.has(id) ? inGroup(groupParent.get(id)) : nodeParent.get(id);
  const known = (id: string): boolean => groupParent.has(id) || nodeParent.has(id);

  // Notes: a node in its state's scope, joined by an edge from the state (`right of`) or to it.
  const notes: NoteEdge[] = [];
  for (const n of model.notes) {
    if (!known(n.target)) continue;
    nodeParent.set(n.ast, parentOf(n.target));
    const [from, to] = n.side === 'left' ? [n.ast, n.target] : [n.target, n.ast];
    notes.push({ note: n, id: `${from}-${to}`, from, to });
  }
  const transitions = model.transitions.filter((t) => known(t.from) && known(t.to));

  // The direction each scope is laid out in: a group an edge crosses inherits its parent's
  // (v12, core `inheritCrossedDirections`).
  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>();
    for (let p = parentOf(id); p !== undefined && !out.has(p); p = parentOf(p)) out.add(p);
    return out;
  };
  const crossed = new Set<string>();
  for (const [s, t] of [
    ...transitions.map((e) => [e.from, e.to] as const),
    ...notes.map((e) => [e.from, e.to] as const),
  ]) {
    if (s === t) continue;
    const a = ancestors(s);
    const c = ancestors(t);
    for (const g of a) if (!c.has(g)) crossed.add(g);
    for (const g of c) if (!a.has(g)) crossed.add(g);
  }
  const flowMemo = new Map<string | undefined, Dir>();
  const flowOf = (scope: string | undefined): Dir => {
    const hit = flowMemo.get(scope);
    if (hit) return hit;
    let d: Dir = model.direction;
    if (scope !== undefined) {
      const own = groupDir.get(scope);
      d = own && !crossed.has(scope) ? own : flowOf(parentOf(scope));
    }
    flowMemo.set(scope, d);
    return d;
  };
  const depthOf = (id: string): number => ancestors(id).size;

  return { regionsOf, groupAst, groupDir, parentOf, flowOf, depthOf, notes, transitions };
}

/** The checked style of class names plus own declarations, one per distinct list. */
function styleCache(model: StateModel, ctx: StateRenderContext): Measure['styleOf'] {
  const classDefs = new Map<string, string[]>();
  // `color` in `styles` already sets the label's fill (checkStyle); v12's `textStyles` repeat it
  // as `fill`, which here would also paint the shape.
  for (const c of model.classes) classDefs.set(c.id, c.styles);
  const styles = new Map<string, CheckedStyle>();
  return (classes, own = []) => {
    const decls: string[] = [];
    for (const name of classes) for (const s of classDefs.get(name) ?? []) decls.push(s.trim());
    for (const s of own) decls.push(s.trim());
    const key = decls.join(';');
    let style = styles.get(key);
    if (!style) styles.set(key, (style = checkStyle(decls, (w) => ctx.warn(w))));
    return style;
  };
}

/** A text box: the label and its padding (in cells, a border cell on each side too). */
function boxOf(
  label: MeasuredLabel,
  pad: { readonly x: number; readonly y: number },
  m: Measure,
  minWidth = 0
): { w: number; h: number } {
  if (m.cells) {
    return { w: label.width + 2 * (pad.x + 1), h: label.lines.length + 2 * (pad.y + 1) };
  }
  return { w: Math.max(label.width, minWidth) + 2 * pad.x, h: label.height + 2 * pad.y };
}

/** A folded block (#670): its title (or its id) and its inner type, in the folded shape. */
function folded(
  base: Pick<StateNodeView, 'id' | 'ast' | 'parent' | 'flow' | 'style' | 'state'>,
  s: StateNode,
  style: CheckedStyle,
  m: Measure,
  shapes: BlockShapes
): StateNodeView {
  const label = m.label(s.title || s.id, style, Infinity);
  const type = m.foldedType?.(s.id) ?? '';
  // The type in small capitals, measured at their size.
  const fold = {
    type,
    label: m.typeLabel(shapes.foldedTypeText(type), shapes.foldedTypeSize),
  };
  // In cells: the title rows, a divider and the type row, padded in a border (a text-form box).
  const pad = m.units.builder.nodePad;
  const { width: w, height: h } = m.cells
    ? shapes.foldedCells({ width: label.width, rows: label.lines.length }, fold.label, pad)
    : shapes.foldedSize(label, fold.label, type.length);
  return { ...base, shape: 'embed', block: 'folded', label, fold, w, h };
}

function measureState(
  s: StateNode,
  style: CheckedStyle,
  parent: string | undefined,
  flow: Dir,
  m: Measure
): StateNodeView {
  const base = { id: s.id, ast: s.ast, parent, flow, style, state: s };
  const { sm } = m;
  switch (s.kind) {
    case 'start':
    case 'end':
      return { ...base, shape: s.kind, label: m.label('', style, 0), w: sm.pseudo, h: sm.pseudo };
    case 'choice':
      return { ...base, shape: 'choice', label: m.label('', style, 0), w: sm.choice, h: sm.choice };
    case 'fork':
    case 'join': {
      const [w, h] = sideways(flow) ? [sm.bar.short, sm.bar.long] : [sm.bar.long, sm.bar.short];
      return { ...base, shape: s.kind, label: m.label('', style, 0), w, h };
    }
    case 'embed': {
      const { shapes } = m;
      // Without core's block shapes (the plugin called without `mermaid`): a plain state.
      if (!shapes) break;
      if (s.folded) return folded(base, s, style, m, shapes);
      // The title stays on one line: the strip is as wide as the inner diagram allows.
      const label = m.label(s.title ?? '', style, Infinity);
      const embed = m.embed?.(s.id) ?? null;
      const { width: w, height: h } = shapes.framedSize(embed, label);
      return { ...base, shape: 'embed', block: 'embed', label, embed, w, h };
    }
    case 'plain':
    case 'composite':
      break;
  }
  if (s.descriptions.length > 1) {
    // v12 `rectWithTitle`: the id as a title, a divider, then the description lines.
    const label = m.label(s.id, style, m.wrap);
    const rows = m.label(s.descriptions.join('\n'), style, m.wrap);
    const wide = label.width > rows.width ? label : rows;
    const box = boxOf(wide, sm.statePad, m, m.cells ? 0 : m.minWidth);
    const tall = m.cells ? label.lines.length + rows.lines.length : label.height + rows.height;
    const h = tall + sm.descGap + (m.cells ? 2 * (sm.statePad.y + 1) : 2 * sm.statePad.y);
    return { ...base, shape: 'described', label, rows, w: box.w, h };
  }
  const label = m.label(labelText(s), style, m.wrap);
  return {
    ...base,
    shape: 'state',
    label,
    ...boxOf(label, sm.statePad, m, m.cells ? 0 : m.minWidth),
  };
}

/** The graph the layout engine gets, every length from the unit profile. */
function layoutGraph(
  model: StateModel,
  { nodes, groups, edges }: Pick<StatePrepared, 'nodes' | 'groups' | 'edges'>,
  regionsOf: ReadonlyMap<string, readonly string[]>,
  groupDir: ReadonlyMap<string, Dir | undefined>,
  m: Measure,
  length: ConfigLength
): LayoutGraph {
  const { units } = m;
  const b = units.builder;
  const fromConfig = (key: string, fallback: number, axis: 'x' | 'y', min: number): number => {
    const px = length(key);
    return px === undefined ? fallback : fromPx(units, px, axis, min);
  };
  const along = sideways(model.direction) ? 'x' : 'y';
  const across = along === 'x' ? 'y' : 'x';
  const spacingOn = (rank: 'x' | 'y', node: 'x' | 'y') => ({
    node: fromConfig('nodeSpacing', b.spacing.node, node, b.minSpacing.node),
    rank: fromConfig('rankSpacing', b.spacing.rank, rank, b.minSpacing.rank),
    edge: b.spacing.edge,
  });
  const spacing = spacingOn(along, across);
  const down = spacingOn('y', 'x');
  const turned = down.node !== spacing.node || down.rank !== spacing.rank;
  // Composites a reopening left holding plain children beside its regions (model `group()`).
  const mixed = new Set<string>();
  for (const x of [...nodes, ...groups.filter((g) => !g.region)])
    if (x.parent !== undefined && regionsOf.has(x.parent)) mixed.add(x.parent);
  const graph: LayoutGraph = {
    direction: model.direction,
    nodes: nodes.map((n): LayoutNode => {
      const node: LayoutNode = { id: n.id, width: n.w, height: n.h, shape: n.shape };
      if (n.parent !== undefined) node.parent = n.parent;
      // Round shapes take every edge at the middle of a side.
      if (n.shape === 'start' || n.shape === 'end' || n.shape === 'choice') node.span = 0;
      return node;
    }),
    groups: groups.map((g): LayoutGroup => {
      const group: LayoutGroup = { id: g.id, padding: groupPadding(g, regionsOf, mixed, b) };
      if (g.label.height > 0) group.title = { width: g.label.width, height: g.label.height };
      if (g.parent !== undefined) group.parent = g.parent;
      const d = groupDir.get(g.id);
      if (d) group.direction = d;
      return group;
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      minLen: 1,
      ...(e.label.width > 0
        ? {
            label: {
              width: e.label.width + b.labelPatch.x,
              height: e.label.height + b.labelPatch.y,
            },
          }
        : {}),
    })),
    spacing,
    ...(turned ? { turnedSpacing: down } : {}),
    diagramPadding: b.diagramPadding,
    // On the grid routes are always square (D78).
    routing: units.grid === undefined ? 'curved' : 'stepped',
    headRoom: b.headRoom,
    metrics: units.engine,
  };
  if (units.grid !== undefined) graph.grid = units.grid;
  return graph;
}

/**
 * A composite's padding holds its title; one split into regions leaves the rest of its padding
 * to the regions, so the region frames tile it and the dividers run border to border. A region
 * has no title. A composite that also holds plain children (`mixed`: an earlier opening put
 * states in it directly) keeps its padding, so those children do not touch its border.
 */
function groupPadding(
  g: StateGroupView,
  regionsOf: ReadonlyMap<string, readonly string[]>,
  mixed: ReadonlySet<string>,
  b: UnitProfile['builder']
): LayoutGroup['padding'] {
  const top = g.label.height > 0 ? b.titlePad : b.groupPad;
  if (!g.region && regionsOf.has(g.id) && !mixed.has(g.id))
    return { top, right: 0, bottom: 0, left: 0 };
  return { top, right: b.groupPad, bottom: b.groupPad, left: b.groupPad };
}
