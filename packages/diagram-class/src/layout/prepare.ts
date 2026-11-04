// ClassModel → LayoutGraph (spec #126 T3, DESIGN §6.1): what v12's `ClassDB.getData`
// (classDb.ts at fa796a943) handed its layout, with every box measured before layout through
// the injected measurer and every length from the unit profile (D77, ADR-13).
import type { AstId } from '@mermaid-js/core/parser-kit';
import {
  fromPx,
  pxProfile,
  type Dir,
  type LayoutEdge,
  type LayoutGraph,
  type LayoutGroup,
  type LayoutNode,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import {
  namespaceGroups,
  type ClassInterface,
  type ClassModel,
  type ClassNode,
  type ClassNote,
  type ClassRelation,
  type NamespaceGroup,
  type RelationType,
} from '../parser/model.ts';
import { measureBox, type BoxMetrics, type ClassBoxGeometry } from './box.ts';
import type { ClassLayoutContext } from './context.ts';

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
  /** Markdown (v12 `labelType: 'markdown'`), not wrapped, drawn left-aligned (v12). */
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
  /** The `: label` (markdown, v12). */
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
}

// v12's lengths, in px (classBox.ts, shapeUtil.ts, classDb.ts getData at fa796a943).
/** `class.padding ?? 12`: room around each part of a class box. */
const BOX_PAD = 12;
/** shapeUtil's TEXT_PADDING for SVG labels: room between two member rows. */
const ROW_GAP = 3;
/** `class.padding ?? 6`: room around a note's text. */
const NOTE_PAD = 6;

const DIRS: ReadonlySet<string> = new Set(['TB', 'BT', 'LR', 'RL']);
const sideways = (d: Dir): boolean => d === 'LR' || d === 'RL';

/** A config number (v12 also took numeric strings), capped; NaN when not one. */
function num(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return typeof n === 'number' && n >= 0 && n < 1e4 ? n : NaN;
}

/** Literal text (`List<T>` is not a tag); character references are read. */
const literal = (text: string): string => text.replaceAll('<', '&lt;');

/** What the view builders share. */
interface Build {
  readonly model: ClassModel;
  readonly ctx: ClassLayoutContext;
  readonly units: UnitProfile;
  readonly label: (text: string, markdown: boolean, max?: number) => MeasuredLabel;
  readonly px: (value: number, axis: 'x' | 'y') => number;
  /** Layout id of the group a class's or note's `parent` namespace is drawn as. */
  readonly groupOf: (ns: string | undefined) => string | undefined;
  readonly views: Map<string, ClassNodeView | NamespaceView>;
  /** Layout id by class id and by interface id. */
  readonly classIds: Map<string, string>;
  readonly interfaceIds: Map<string, string>;
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
  const build: Build = {
    model,
    ctx,
    units,
    label: (text, markdown, max = Infinity) =>
      layoutLabel(markdown ? text : literal(text), font, max, ctx.measurer, { markdown }),
    px: (value, axis) => fromPx(units, value, axis),
    groupOf: (ns) => {
      const g = parentOf(ns);
      return g === undefined ? undefined : `s:${g}`;
    },
    views: new Map(),
    classIds: new Map(),
    interfaceIds: new Map(),
  };
  const padding = num(conf.padding);
  const boxPad = Number.isNaN(padding) ? BOX_PAD : padding;
  const metrics: BoxMetrics = {
    pad: { x: build.px(boxPad, 'x'), y: build.px(boxPad, 'y') },
    rowGap: build.px(ROW_GAP, 'y'),
    empty: build.px(boxPad, 'y'),
    hideEmpty: conf.hideEmptyMembersBox === true,
  };
  const groups = groupViews(nsGroups, build);
  const boxes = model.classes.map((node) => boxView(node, font, metrics, build));
  const edges: ClassEdgeView[] = [];
  const notes = noteViews(Number.isNaN(padding) ? NOTE_PAD : padding, build, edges);
  const interfaces = model.interfaces.map((iface) => interfaceView(iface, build));
  edges.push(...relationEdges(build));
  const graph = layoutGraph(model, ctx, units, { boxes, notes, interfaces, groups, edges });
  return { graph, boxes, notes, interfaces, groups, edges, views: build.views };
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
      label: build.label(g.label, false),
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
    ...measureBox(node, font, build.ctx.measurer, metrics),
    ...withParent(build.groupOf(node.parent)),
  };
  build.views.set(view.layoutId, view);
  build.classIds.set(node.id, view.layoutId);
  return view;
}

/** The notes, and an edge from each to its class (v12 `edgeNote<i>`) pushed onto `edges`. */
function noteViews(pad: number, build: Build, edges: ClassEdgeView[]): NoteView[] {
  return build.model.notes.map((note) => {
    const text = build.label(note.text, true);
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
  const text = build.label(iface.label, false);
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
  const ids = new Set<string>();
  const endOf = (id: string): string | undefined =>
    build.classIds.get(id) ?? build.interfaceIds.get(id);
  // A written `"none"` multiplicity drew nothing in v12.
  const multiplicity = (text: string | undefined): MeasuredLabel | undefined =>
    text === undefined || text === '' || text === 'none' ? undefined : build.label(text, false);
  const edges: ClassEdgeView[] = [];
  for (const rel of build.model.relations) {
    const source = endOf(rel.start.id);
    const target = endOf(rel.end.id);
    if (source === undefined || target === undefined) continue;
    let layoutId = rel.ast;
    for (let n = 2; ids.has(layoutId); n++) layoutId = `${rel.ast}#${n}`;
    ids.add(layoutId);
    const middle = rel.label ? build.label(rel.label, true, edgeWrap) : undefined;
    const startLabel = multiplicity(rel.start.multiplicity);
    const endLabel = multiplicity(rel.end.multiplicity);
    edges.push({
      layoutId,
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

function layoutGraph(
  model: ClassModel,
  ctx: ClassLayoutContext,
  units: UnitProfile,
  parts: Pick<ClassPrepared, 'boxes' | 'notes' | 'interfaces' | 'groups' | 'edges'>
): LayoutGraph {
  const b = units.builder;
  const conf = ctx.config.class ?? {};
  const direction: Dir = DIRS.has(model.direction) ? (model.direction as Dir) : 'TB';
  const fromConfig = (value: unknown, fallback: number, axis: 'x' | 'y', min: number): number => {
    const v = num(value);
    return Number.isNaN(v) ? fallback : fromPx(units, v, axis, min);
  };
  const along = sideways(direction) ? 'x' : 'y';
  const across = along === 'x' ? 'y' : 'x';
  // `class.nodeSpacing` runs across the flow and `class.rankSpacing` along it (v12 fell back
  // to 50 for both).
  const spacingOn = (rank: 'x' | 'y', node: 'x' | 'y') => ({
    node: fromConfig(conf.nodeSpacing, b.spacing.node, node, b.minSpacing.node),
    rank: fromConfig(conf.rankSpacing, b.spacing.rank, rank, b.minSpacing.rank),
    edge: b.spacing.edge,
  });
  const spacing = spacingOn(along, across);
  const down = spacingOn('y', 'x');
  const turned = down.node !== spacing.node || down.rank !== spacing.rank;
  const headRoom = b.headRoom;
  const size = (l: MeasuredLabel) => ({ width: l.width, height: l.height });
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
        padding: {
          top: titled ? b.titlePad : b.groupPad,
          right: b.groupPad,
          bottom: b.groupPad,
          left: b.groupPad,
        },
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
        // Multiplicities need no room of their own: the engine puts them `endLabelAcross` off
        // the line, which clears any end marker up to twice that across (v12's are 12 px).
        ...(e.startLabel ? { startLabel: size(e.startLabel) } : {}),
        ...(e.endLabel ? { endLabel: size(e.endLabel) } : {}),
      })
    ),
    spacing,
    ...(turned ? { turnedSpacing: down } : {}),
    diagramPadding:
      units.grid === undefined
        ? fromConfig(conf.diagramPadding, b.diagramPadding, 'x', 0)
        : b.diagramPadding,
    // v12 drew class edges with flowchart's default `rounded` curve: right angles.
    routing: 'stepped',
    headRoom,
    metrics: units.engine,
  };
  if (units.grid !== undefined) graph.grid = units.grid;
  return graph;
}
