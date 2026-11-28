// ClassModel → LayoutGraph (spec #126 T3, DESIGN §6.1): what v12's `ClassDB.getData`
// (classDb.ts at fa796a943) handed its layout, with every box measured before layout through
// the injected measurer and every length from the unit profile (D77, ADR-13).
import type { AstId } from '@mermaid-js/core/parser-kit';
import {
  fromPx,
  pxProfile,
  type EndMarker,
  type LayoutEdge,
  type LayoutGraph,
  type LayoutGroup,
  type LayoutNode,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { graphSpacing } from '@mermaid-js/shared/layout';
import { curveResolver, curveRouting, type CurveKind } from '@mermaid-js/shared/svg/route';
import {
  layoutLabel,
  type FontKey,
  type LabelSource,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import { readLabel } from '@mermaid-js/core/text/markdown-warning';
import {
  namespaceGroups,
  type ClassInterface,
  type ClassModel,
  type ClassNode,
  type ClassNote,
  type ClassRelation,
  type NamespaceGroup,
  type RelationEnd,
  type RelationType,
} from '../parser/model.ts';
import { MARKER_ACROSS } from '../render/markers.ts';
import { CLASS_CURVE } from './curve.ts';
import { measureBox, type BoxMetrics, type ClassBoxGeometry, type ReadLabel } from './box.ts';
import { configDefaults } from '../config-defaults.ts';
import { configLengths, type ConfigLength } from '@mermaid-js/shared/config/readers';
import type { ClassLayoutContext } from './context.ts';
import type { Warning } from '@mermaid-js/core';

/** A class, as laid out. */
export interface ClassBoxView extends ClassBoxGeometry {
  readonly kind: 'class';
  /** The node's id in the `LayoutGraph` and `LayoutModel` (`c:<class id>`). */
  readonly layoutId: string;
  /** The class id (`data-id`). */
  readonly id: string;
  readonly ast: AstId;
  readonly node: ClassNode;
  /** Layout id of the namespace group it sits in. */
  readonly parent?: string;
}

/** A note, as laid out: its text in a box. */
export interface NoteView {
  readonly kind: 'note';
  /** `t:<note id>`. */
  readonly layoutId: string;
  /** `note0`, `note1`, … */
  readonly id: string;
  readonly ast: AstId;
  readonly note: ClassNote;
  readonly width: number;
  readonly height: number;
  /** Not wrapped, drawn left-aligned (v12). */
  readonly label: MeasuredLabel;
  readonly parent?: string;
}

/** The interface end of a lollipop relationship: its name in a borderless box. */
export interface InterfaceView {
  readonly kind: 'interface';
  /** `i:<interface id>`. */
  readonly layoutId: string;
  /** `interface0`, … */
  readonly id: string;
  readonly ast: AstId;
  readonly iface: ClassInterface;
  readonly width: number;
  readonly height: number;
  readonly label: MeasuredLabel;
  /** The group of the class it belongs to. */
  readonly parent?: string;
}

export type ClassNodeView = ClassBoxView | NoteView | InterfaceView;

/** A namespace, as a layout group. */
export interface NamespaceView {
  /** `s:<qualified id>`. */
  readonly layoutId: string;
  readonly id: string;
  readonly ast?: AstId;
  /** The title: the last part of the id, or the whole id when `hierarchicalNamespaces` is off. */
  readonly label: MeasuredLabel;
  readonly parent?: string;
  /** 0 at the top. */
  readonly depth: number;
}

/**
 * - `relation`: a relationship between two classes.
 * - `lollipop`: a relationship with an interface at one end (its marker is `lollipop`).
 * - `note`: a note to its class, drawn dashed with no markers (v12 `edgeNote<i>`).
 */
export type ClassEdgeKind = 'relation' | 'lollipop' | 'note';

export interface ClassEdgeView {
  /** The edge's id in the `LayoutGraph` and `LayoutModel`: the relationship's AST id, or `note>:<note id>`. */
  readonly layoutId: string;
  readonly kind: ClassEdgeKind;
  readonly ast: AstId;
  readonly relation?: ClassRelation;
  readonly note?: ClassNote;
  /** Layout ids of its ends. */
  readonly source: string;
  readonly target: string;
  /** `..` relationships and note edges are dashed (v12). */
  readonly line: 'solid' | 'dashed';
  /** Marker at each end; always `none` on a note edge. */
  readonly startMarker: RelationType;
  readonly endMarker: RelationType;
  /** The `: label`. */
  readonly label?: MeasuredLabel;
  /** The multiplicities (`"1"`, `"many"`), placed by the engine (D102). */
  readonly startLabel?: MeasuredLabel;
  readonly endLabel?: MeasuredLabel;
}

export interface ClassPrepared {
  readonly graph: LayoutGraph;
  /** In declaration order (v12's palette order, `colorIndex`). */
  readonly boxes: readonly ClassBoxView[];
  readonly notes: readonly NoteView[];
  readonly interfaces: readonly InterfaceView[];
  /** Outermost first. */
  readonly groups: readonly NamespaceView[];
  /** Note edges, then relationships, as v12 listed them. */
  readonly edges: readonly ClassEdgeView[];
  /** Every node and group view by layout id. */
  readonly views: ReadonlyMap<string, ClassNodeView | NamespaceView>;
  /**
   * How to draw the edges between route points: `class.curve`, else the top-level `curve`, else
   * {@link CLASS_CURVE} (D733; v12 drew class edges with `flowchart.curve`). The graph's
   * `routing` follows it.
   */
  readonly curve: ClassCurve;
}

// v12's lengths, in px (classBox.ts, shapeUtil.ts, classDb.ts getData at fa796a943).
/** `class.padding ?? 12`: room around each part of a class box. */
const BOX_PAD = 12;
/** shapeUtil's TEXT_PADDING for SVG labels: room between two member rows. */
const ROW_GAP = 3;
/** `class.padding ?? 6`: room around a note's text. */
const NOTE_PAD = 6;
/** `class.padding ?? 16`: room between a namespace's border and its content, every side. */
const GROUP_PAD = 16;

/** How class edges are drawn: one of flowchart's curve names (D733). */
export type ClassCurve = CurveKind;

/** What the view builders share. */
interface Build {
  readonly model: ClassModel;
  readonly ctx: ClassLayoutContext;
  readonly units: UnitProfile;
  /**
   * Reads a label with core's label handler (#1368), giving the render's warning for markdown
   * outside a markdown string. Every label of the diagram is read so: class box text, notes,
   * relation labels, multiplicities, namespace titles and interface names.
   */
  readonly read: ReadLabel;
  /** A note, relation label, namespace title or interface name. */
  readonly label: (text: string, max?: number, markdown?: boolean) => MeasuredLabel;
  /** A multiplicity, in `classTerminalFontSize` (v12 `.edgeTerminals`, 11px). */
  readonly terminal: (text: string) => MeasuredLabel;
  readonly px: (value: number, axis: 'x' | 'y') => number;
  /** Layout id of the group a class's or note's `parent` namespace is drawn as. */
  readonly groupOf: (ns: string | undefined) => string | undefined;
  readonly views: Map<string, ClassNodeView | NamespaceView>;
  /** Layout id by class id and by interface id. */
  readonly classIds: Map<string, string>;
  readonly interfaceIds: Map<string, string>;
}

/** The multiplicities' font size: the theme's `classTerminalFontSize`, else the diagram's. */
function terminalSize(ctx: ClassLayoutContext, fallback: number): number {
  const n = ctx.theme.number('classTerminalFontSize');
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : fallback;
}

const withParent = (parent: string | undefined): { parent?: string } =>
  parent === undefined ? {} : { parent };

/**
 * Measures the model and builds the graph the layout engine gets. Every length comes from the
 * unit profile: px config values and v12's px constants are converted with `fromPx`, the rest
 * is `units.builder`.
 */
export function prepare(model: ClassModel, ctx: ClassLayoutContext): ClassPrepared {
  const units: UnitProfile = ctx.units ?? pxProfile;
  const conf = ctx.config.class ?? {};
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('fontSize'),
    weight: 400,
  };
  const { groups: nsGroups, parentOf } = namespaceGroups(
    model,
    conf.hierarchicalNamespaces !== false
  );
  const warnCtx = { config: ctx.config, inline: ctx.inline, warn: (w: Warning) => ctx.warn?.(w) };
  const read: ReadLabel = (text, markdown = false) => readLabel(text, { markdown }, warnCtx);
  const lay = (source: LabelSource, max: number, key = font): MeasuredLabel =>
    layoutLabel(source.text, key, max, ctx.measurer, { ...source, inline: ctx.inline });
  const build: Build = {
    model,
    ctx,
    units,
    read,
    label: (text, max = Infinity, markdown = false) => lay(read(text, markdown), max),
    terminal: (text) => lay(read(text), Infinity, { ...font, size: terminalSize(ctx, font.size) }),
    px: (value, axis) => fromPx(units, value, axis),
    groupOf: (ns) => {
      const g = parentOf(ns);
      return g === undefined ? undefined : `s:${g}`;
    },
    views: new Map(),
    classIds: new Map(),
    interfaceIds: new Map(),
  };
  const length = configLengths('class', 'CLASS_CONFIG_IGNORED', conf, configDefaults, (w) =>
    ctx.warn?.(w)
  );
  const padding = length('padding');
  const boxPad = padding ?? BOX_PAD;
  const metrics: BoxMetrics = {
    pad: { x: build.px(boxPad, 'x'), y: build.px(boxPad, 'y') },
    rowGap: build.px(ROW_GAP, 'y'),
    hideEmpty: conf.hideEmptyMembersBox === true,
  };
  const groups = groupViews(nsGroups, build);
  const boxes = model.classes.map((node) => boxView(node, font, metrics, build));
  const edges: ClassEdgeView[] = [];
  const notes = noteViews(padding ?? NOTE_PAD, build, edges);
  const interfaces = model.interfaces.map((iface) => interfaceView(iface, build));
  edges.push(...relationEdges(build));
  const curve = curveResolver(ctx.config.curve, CLASS_CURVE, (w) => ctx.warn?.(w))(conf.curve);
  const graph = layoutGraph(model, ctx, units, curve, length, {
    boxes,
    notes,
    interfaces,
    groups,
    edges,
  });
  return { graph, boxes, notes, interfaces, groups, edges, views: build.views, curve };
}

function groupViews(nsGroups: readonly NamespaceGroup[], build: Build): NamespaceView[] {
  const depthOf = new Map<string, number>();
  const groups: NamespaceView[] = [];
  for (const g of nsGroups) {
    const depth = g.parent === undefined ? 0 : (depthOf.get(g.parent) ?? 0) + 1;
    depthOf.set(g.id, depth);
    const view: NamespaceView = {
      layoutId: `s:${g.id}`,
      id: g.id,
      ...(g.ast !== undefined ? { ast: g.ast } : {}),
      label: g.markdown ? build.label(g.label.slice(1, -1), Infinity, true) : build.label(g.label),
      ...withParent(g.parent === undefined ? undefined : `s:${g.parent}`),
      depth,
    };
    groups.push(view);
    build.views.set(view.layoutId, view);
  }
  return groups.sort((g, h) => g.depth - h.depth);
}

function boxView(node: ClassNode, font: FontKey, metrics: BoxMetrics, build: Build): ClassBoxView {
  const view: ClassBoxView = {
    kind: 'class',
    layoutId: `c:${node.id}`,
    id: node.id,
    ast: node.ast,
    node,
    ...measureBox(node, font, build.ctx.measurer, metrics, build.read, build.ctx.inline),
    ...withParent(build.groupOf(node.parent)),
  };
  build.views.set(view.layoutId, view);
  build.classIds.set(node.id, view.layoutId);
  return view;
}

/** The notes, and an edge from each to its class (v12 `edgeNote<i>`) pushed onto `edges`. */
function noteViews(pad: number, build: Build, edges: ClassEdgeView[]): NoteView[] {
  return build.model.notes.map((note) => {
    const text = note.markdown
      ? build.label(note.text.slice(1, -1), Infinity, true)
      : build.label(note.text);
    const view: NoteView = {
      kind: 'note',
      layoutId: `t:${note.id}`,
      id: note.id,
      ast: note.ast,
      note,
      width: text.width + 2 * build.px(pad, 'x'),
      height: text.height + 2 * build.px(pad, 'y'),
      label: text,
      ...withParent(build.groupOf(note.parent)),
    };
    build.views.set(view.layoutId, view);
    // v12 looked the class up by the name as written, so `note for A~T~` gets no edge.
    const target = note.class === undefined ? undefined : build.classIds.get(note.class);
    if (target !== undefined) {
      edges.push({
        layoutId: `note>:${note.id}`,
        kind: 'note',
        ast: note.ast,
        note,
        source: view.layoutId,
        target,
        line: 'dashed',
        startMarker: 'none',
        endMarker: 'none',
      });
    }
    return view;
  });
}

function interfaceView(iface: ClassInterface, build: Build): InterfaceView {
  const patch = build.units.builder.labelPatch;
  const text = build.label(iface.label);
  const owner = build.classIds.get(iface.classId);
  const view: InterfaceView = {
    kind: 'interface',
    layoutId: `i:${iface.id}`,
    id: iface.id,
    ast: iface.ast,
    iface,
    width: text.width + patch.x,
    height: text.height + patch.y,
    label: text,
    ...withParent(
      owner === undefined ? undefined : (build.views.get(owner) as ClassBoxView).parent
    ),
  };
  build.views.set(view.layoutId, view);
  build.interfaceIds.set(iface.id, view.layoutId);
  return view;
}

function relationEdges(build: Build): ClassEdgeView[] {
  const edgeWrap = build.units.builder.edgeWrap;
  // A lollipop end names its interface; a class may be called `interface0` too.
  const endOf = (end: RelationEnd): string | undefined =>
    (end.type === 'lollipop' ? build.interfaceIds.get(end.id) : undefined) ??
    build.classIds.get(end.id);
  // A written `"none"` multiplicity drew nothing in v12.
  const multiplicity = (text: string | undefined): MeasuredLabel | undefined =>
    text === undefined || text === '' || text === 'none' ? undefined : build.terminal(text);
  const edges: ClassEdgeView[] = [];
  for (const rel of build.model.relations) {
    const source = endOf(rel.start);
    const target = endOf(rel.end);
    if (source === undefined || target === undefined) continue;
    const middle = rel.label ? build.label(rel.label, edgeWrap) : undefined;
    const startLabel = multiplicity(rel.start.multiplicity);
    const endLabel = multiplicity(rel.end.multiplicity);
    // AST ids are unique per parse (parallel relationships are `e:A>B#2`, …), so the
    // relationship's own id is its layout id and its edge always carries its `data-ast`.
    edges.push({
      layoutId: rel.ast,
      kind: rel.start.type === 'lollipop' || rel.end.type === 'lollipop' ? 'lollipop' : 'relation',
      ast: rel.ast,
      relation: rel,
      source,
      target,
      line: rel.line === 'dotted' ? 'dashed' : 'solid',
      startMarker: rel.start.type,
      endMarker: rel.end.type,
      ...(middle && middle.width > 0 ? { label: middle } : {}),
      ...(startLabel ? { startLabel } : {}),
      ...(endLabel ? { endLabel } : {}),
    });
  }
  return edges;
}

/**
 * The room each end marker takes out from the box, px: what the renderer draws in the built-in
 * themes, outline included, rounded up (gap + length + outline; redux's diamonds 19.75). A
 * constant, as flowchart's head room (D154), so the theme marker variables never move the
 * layout. The built-in themes' marker variables live in core's theme specs, which load lazily,
 * so this cannot be computed here; the class layout spec checks that each entry is
 * `ceil(max markerReach)` over every built-in theme.
 */
export const MARKER_ROOM: Readonly<Record<RelationType, number>> = {
  none: 0,
  aggregation: 20,
  composition: 20,
  extension: 19,
  dependency: 13,
  lollipop: 14,
};

function layoutGraph(
  model: ClassModel,
  ctx: ClassLayoutContext,
  units: UnitProfile,
  curve: ClassCurve,
  configLength: ConfigLength,
  parts: Pick<ClassPrepared, 'boxes' | 'notes' | 'interfaces' | 'groups' | 'edges'>
): LayoutGraph {
  const b = units.builder;
  const direction = model.direction;
  const fromConfig = (key: string, fallback: number, axis: 'x' | 'y', min: number): number => {
    const v = configLength(key);
    return v === undefined ? fallback : fromPx(units, v, axis, min);
  };
  // `class.nodeSpacing` runs across the flow and `class.rankSpacing` along it (v12 fell back
  // to 50 for both).
  const spacing = graphSpacing(units, direction, configLength);
  const headRoom = b.headRoom;
  // v12 padded namespaces with `class.padding ?? 16` on every side; the title adds its height.
  const groupPx = configLength('padding') ?? GROUP_PAD;
  const groupPad = { x: fromPx(units, groupPx, 'x'), y: fromPx(units, groupPx, 'y') };
  const size = (l: MeasuredLabel) => ({ width: l.width, height: l.height });
  // Only where end labels are placed in px (class has no text output).
  const marker = (type: RelationType): EndMarker | undefined => {
    const length = MARKER_ROOM[type];
    return units.grid === undefined && length > 0 ? { length, width: MARKER_ACROSS } : undefined;
  };
  const node = (
    v: { layoutId: string; width: number; height: number; parent?: string },
    shape: string
  ): LayoutNode => ({
    id: v.layoutId,
    width: v.width,
    height: v.height,
    shape,
    ...(v.parent !== undefined ? { parent: v.parent } : {}),
  });
  const graph: LayoutGraph = {
    direction,
    nodes: [
      ...parts.boxes.map((v) => node(v, 'classBox')),
      ...parts.notes.map((v) => node(v, 'note')),
      ...parts.interfaces.map((v) => node(v, 'interface')),
    ],
    groups: parts.groups.map((g): LayoutGroup => {
      const titled = g.label.height > 0;
      return {
        id: g.layoutId,
        padding: { top: groupPad.y, right: groupPad.x, bottom: groupPad.y, left: groupPad.x },
        ...(titled ? { title: { width: g.label.width, height: g.label.height } } : {}),
        ...(g.parent !== undefined ? { parent: g.parent } : {}),
      };
    }),
    edges: parts.edges.map(
      (e): LayoutEdge => ({
        id: e.layoutId,
        source: e.source,
        target: e.target,
        minLen: 1,
        ...(e.label
          ? {
              label: {
                width: e.label.width + b.labelPatch.x,
                height: e.label.height + b.labelPatch.y,
              },
            }
          : {}),
        // Multiplicities need no room of their own: the engine puts them past their own end's
        // marker and clear of every edge's markers, which it is told about (#201, D607).
        ...(e.startLabel ? { startLabel: size(e.startLabel) } : {}),
        ...(e.endLabel ? { endLabel: size(e.endLabel) } : {}),
        ...(marker(e.startMarker) ? { startMarker: marker(e.startMarker)! } : {}),
        ...(marker(e.endMarker) ? { endMarker: marker(e.endMarker)! } : {}),
        // The engine takes a marker at the target alone as given; others say where theirs are
        // (D682): a label sits midway along the line the markers leave.
        ...(e.startMarker !== 'none' || e.endMarker === 'none'
          ? { heads: { source: e.startMarker !== 'none', target: e.endMarker !== 'none' } }
          : {}),
      })
    ),
    ...spacing,
    diagramPadding:
      units.grid === undefined
        ? fromConfig('diagramPadding', b.diagramPadding, 'x', 0)
        : b.diagramPadding,
    // `flowchart.curve`, as v12 drew class edges with it; `rounded` (right angles) by default.
    // On the grid routes are always square (D78).
    routing: units.grid === undefined ? curveRouting(curve) : 'stepped',
    headRoom,
    metrics: units.engine,
  };
  if (units.grid !== undefined) graph.grid = units.grid;
  return graph;
}
