// UsecaseModel → LayoutGraph (DESIGN §6.1, spec #517 T3): every node measured before layout, in
// the font its label is drawn in (pitfall 16), as v12's `getData` and shapes size them. Actors
// are a glyph with the labels below and take no least width; use cases, notes and JSON tables
// are at least `minNodeWidth` wide. Boundaries are groups with the title in the top padding. A
// note joins its target through an internal dotted edge. Every length comes from the metrics
// table, the config or core's px profile (pitfall 13: `usecase-layout-literals.spec.ts`).
import {
  pxProfile,
  type LayoutEdge,
  type LayoutGraph,
  type LayoutGroup,
  type LayoutNode,
} from '@mermaid-js/core/layout';
import { checkStyle, type CheckedStyle } from '@mermaid-js/core/svg';
import {
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import {
  FONT_WEIGHT,
  usecaseLayoutConfig,
  type ConfigFont,
  type UsecaseLayoutConfig,
} from '../config.ts';
import type {
  UsecaseActor,
  UsecaseBoundary,
  UsecaseJsonRow,
  UsecaseJsonTable,
  UsecaseLabelType,
  UsecaseModel,
  UsecaseNote,
  UsecaseRelationship,
  UsecaseUseCase,
} from '../model.ts';
import type { UsecaseLayoutContext } from './context.ts';
import { PX } from './metrics.ts';

/** Fields every node view has. */
interface NodeViewBase {
  /** Layout node id: the element's AST id. */
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** `default`, then the element's classes (v12's `cssCompiledStyles`), then its `style`. */
  readonly style: CheckedStyle;
  /** Layout group id of its boundary. */
  readonly parent?: string;
}

/** An actor: the glyph, then the stereotype and the name under it, padded round. */
export interface ActorView extends NodeViewBase {
  readonly kind: 'actor';
  readonly actor: UsecaseActor;
  readonly font: FontKey;
  readonly label: MeasuredLabel;
  /** `«stereotype»`, above the name. */
  readonly stereotype?: MeasuredLabel;
  /** Offsets from the box's top: the glyph's top, the stereotype's, the name's. */
  readonly glyphTop: number;
  readonly stereotypeTop: number;
  readonly labelTop: number;
}

/**
 * A use case: an oval (`ellipse`, business or not) round its label block, or a `[rect]` box.
 * The block is the stereotype (`«s»`) over the label, `stereotypeGap` apart, centred in the box.
 */
export interface UseCaseView extends NodeViewBase {
  readonly kind: 'usecase';
  readonly useCase: UsecaseUseCase;
  readonly shape: 'ellipse' | 'rect';
  readonly font: FontKey;
  readonly label: MeasuredLabel;
  readonly stereotype?: MeasuredLabel;
  readonly stereotypeGap: number;
  /** The label block, at least `minNodeWidth` wide. */
  readonly block: { readonly width: number; readonly height: number };
}

export interface NoteView extends NodeViewBase {
  readonly kind: 'note';
  readonly note: UsecaseNote;
  readonly label: MeasuredLabel;
  /** Layout id of the actor or use case it is attached to. */
  readonly target: string;
}

/** One table row: the key and value cells, measured, and the row's band from the box's top. */
export interface JsonRowView {
  readonly row: UsecaseJsonRow;
  readonly key: MeasuredLabel;
  readonly value: MeasuredLabel;
  readonly top: number;
  readonly height: number;
}

/** A JSON table: the title row (its id), then a key and a value column, in a border. */
export interface JsonTableView extends NodeViewBase {
  readonly kind: 'json';
  readonly table: UsecaseJsonTable;
  readonly title: MeasuredLabel;
  readonly border: number;
  /** The title row's height, under the top border. */
  readonly titleHeight: number;
  readonly keyWidth: number;
  readonly valueWidth: number;
  readonly rows: readonly JsonRowView[];
}

export type UsecaseNodeView = ActorView | UseCaseView | NoteView | JsonTableView;

export interface BoundaryView {
  /** Layout group id: the boundary's AST id. */
  readonly id: string;
  readonly boundary: UsecaseBoundary;
  readonly label: MeasuredLabel;
  readonly style: CheckedStyle;
  /** A `package` boundary's tab, at its top left; the title is centred in it. */
  readonly tab?: { readonly width: number; readonly height: number };
}

/**
 * - `relation`: a relationship.
 * - `note`: a note to its target, dotted with no markers (v12's internal `<note>-edge`).
 */
export type UsecaseEdgeKind = 'relation' | 'note';

export interface UsecaseEdgeView {
  /** Layout edge id: the relationship's AST id, or `<note AST id>-edge`. */
  readonly id: string;
  readonly kind: UsecaseEdgeKind;
  readonly relationship?: UsecaseRelationship;
  readonly note?: UsecaseNote;
  /** Layout ids of the ends. */
  readonly source: string;
  readonly target: string;
  /** Include, extend and note edges are dotted (v12 `pattern: 'dotted'`). */
  readonly dotted: boolean;
  /** As drawn: `«include»`, `«extend»`, or an association's label. */
  readonly label?: MeasuredLabel;
  readonly style: CheckedStyle;
}

export interface UsecasePrepared {
  readonly graph: LayoutGraph;
  /** By layout id, in graph order (actors, use cases, notes, JSON tables). */
  readonly nodes: ReadonlyMap<string, UsecaseNodeView>;
  readonly boundaries: readonly BoundaryView[];
  readonly edges: readonly UsecaseEdgeView[];
  readonly config: UsecaseLayoutConfig;
}

/** An include or extend label as v12 drew it. */
export function relationText(r: UsecaseRelationship): string | undefined {
  if (r.type === 'include' || r.type === 'extend') return `«${r.type}»`;
  if (r.type === 'association' && r.label) return r.label;
  return undefined;
}

const sideways = (d: UsecaseModel['direction']): boolean => d === 'LR' || d === 'RL';

interface Measure {
  /** Measures `text` in `font` (with the element's text style), wrapped at `max`. */
  label(
    text: string,
    font: FontKey,
    max: number,
    style: CheckedStyle,
    type?: UsecaseLabelType
  ): MeasuredLabel;
  styleOf(classes: readonly string[], own?: readonly string[]): CheckedStyle;
}

/** A config font in the theme's family when it names none. */
function fontOf(font: ConfigFont, family: string): FontKey {
  return { family: font.family ?? family, size: font.size, weight: font.weight };
}

/** A style's `font-weight` as a number, else `fallback`. */
function weightOf(w: unknown, fallback: number): number {
  if (w === 'bold' || w === 'bolder') return FONT_WEIGHT.bold;
  if (w === 'normal') return FONT_WEIGHT.normal;
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** The font a styled label is drawn in: the style's `font-size`, `font-weight` and italics. */
function styled(font: FontKey, style: CheckedStyle): [FontKey, number] {
  const t = style.text;
  const weight = weightOf(t['font-weight'], font.weight);
  const size = fontSizePx(t['font-size'], font.size);
  const bits = t['font-style'] === 'italic' ? Style.Italic : 0;
  const ok = size !== undefined && size > 0 && size < 1e4;
  return [{ ...font, size: ok ? size : font.size, weight }, bits];
}

/**
 * Measures the model and builds the graph the layout engine gets.
 */
export function prepareUsecase(model: UsecaseModel, ctx: UsecaseLayoutContext): UsecasePrepared {
  const config = usecaseLayoutConfig(
    ctx.config.usecase as Readonly<Record<string, unknown>> | undefined,
    (w) => ctx.warn(w)
  );
  const family = ctx.theme.value('fontFamily');
  const base: FontKey = { family, size: ctx.theme.number('fontSize'), weight: FONT_WEIGHT.normal };
  const actorFont = fontOf(config.actorFont, family);
  const usecaseFont = fontOf(config.usecaseFont, family);
  const edgeFont: FontKey = { ...base, size: PX.edgeFontSize };
  const m: Measure = {
    label: (text, font, max, style, type = 'text') => {
      const [f, bits] = styled(font, style);
      return layoutLabel(text, f, max, ctx.measurer, {
        markdown: type === 'markdown',
        style: bits,
        inline: ctx.inline,
      });
    },
    styleOf: styleCache(model, ctx),
  };

  const boundaryOf = new Map<string, string>();
  for (const b of model.boundaries) boundaryOf.set(b.id, b.astId);
  const parentOf = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : boundaryOf.get(id);

  const nodes = new Map<string, UsecaseNodeView>();
  const layoutId = new Map<string, string>();
  for (const a of model.actors) {
    const v = actorView(a, parentOf(a.parentId), actorFont, config, m);
    nodes.set(v.id, v);
    layoutId.set(a.id, v.id);
  }
  for (const u of model.useCases) {
    const v = useCaseView(u, parentOf(u.parentId), usecaseFont, config, m);
    nodes.set(v.id, v);
    layoutId.set(u.id, v.id);
  }
  const notes: NoteView[] = [];
  for (const n of model.notes) {
    const target = layoutId.get(n.target);
    if (target === undefined) continue;
    const v = noteView(n, target, base, config, m);
    nodes.set(v.id, v);
    notes.push(v);
  }
  for (const t of model.jsonTables) {
    const v = jsonView(t, base, config, m);
    nodes.set(v.id, v);
    layoutId.set(t.id, v.id);
  }

  const boundaries = model.boundaries.map((b) => boundaryView(b, base, m));

  const edges: UsecaseEdgeView[] = [];
  for (const r of model.relationships) {
    const source = layoutId.get(r.source);
    const target = layoutId.get(r.target);
    if (source === undefined || target === undefined) continue;
    const text = relationText(r);
    const style = m.styleOf(r.classes, r.styles);
    edges.push({
      id: r.astId,
      kind: 'relation',
      relationship: r,
      source,
      target,
      dotted: r.type === 'include' || r.type === 'extend',
      ...(text !== undefined
        ? { label: m.label(text, edgeFont, pxProfile.builder.edgeWrap, style, r.labelType) }
        : {}),
      style,
    });
  }
  for (const n of notes) {
    edges.push({
      id: `${n.id}-edge`,
      kind: 'note',
      note: n.note,
      source: n.id,
      target: n.target,
      dotted: true,
      style: m.styleOf([]),
    });
  }

  const graph = layoutGraph(model, nodes, boundaries, edges, config);
  return { graph, nodes, boundaries, edges, config };
}

/** The checked style of class names plus own declarations, one per distinct list. */
function styleCache(model: UsecaseModel, ctx: UsecaseLayoutContext): Measure['styleOf'] {
  const classDefs = new Map<string, readonly string[]>();
  for (const c of model.classDefs) classDefs.set(c.id, c.styles);
  const styles = new Map<string, CheckedStyle>();
  return (classes, own = []) => {
    const decls: string[] = [];
    for (const name of ['default', ...classes]) {
      for (const s of classDefs.get(name) ?? []) decls.push(s.trim());
    }
    for (const s of own) decls.push(s.trim());
    const key = decls.join(';');
    let style = styles.get(key);
    if (!style) styles.set(key, (style = checkStyle(decls, (w) => ctx.warn(w))));
    return style;
  };
}

function withParent<T extends object>(view: T, parent: string | undefined): T {
  return parent === undefined ? view : { ...view, parent };
}

/** v12 `renderUsecaseActor`: the glyph, the stereotype and the name, padded; no least width. */
function actorView(
  actor: UsecaseActor,
  parent: string | undefined,
  font: FontKey,
  config: UsecaseLayoutConfig,
  m: Measure
): ActorView {
  const A = PX.actor;
  const style = m.styleOf(actor.classes, actor.styles);
  const label = m.label(actor.label, font, config.wrappingWidth, style, actor.labelType);
  const stereotype =
    actor.stereotype !== undefined
      ? m.label(`«${actor.stereotype}»`, font, config.wrappingWidth, style)
      : undefined;
  const glyphTop = A.pad;
  const stereotypeTop = glyphTop + A.glyphHeight + A.labelGap;
  const labelTop = stereotypeTop + (stereotype ? stereotype.height + A.stereotypeGap : 0);
  return withParent(
    {
      kind: 'actor',
      id: actor.astId,
      actor,
      font,
      label,
      ...(stereotype ? { stereotype } : {}),
      style,
      width: Math.max(A.glyphWidth, label.width, stereotype?.width ?? 0) + 2 * A.pad,
      height: labelTop + label.height + A.pad,
      glyphTop,
      stereotypeTop,
      labelTop,
    } satisfies ActorView,
    parent
  );
}

/**
 * v12 `usecaseEllipse` / `usecaseBusiness`: the oval is the label block plus `inset` each side;
 * a `[rect]` use case (v12 `squareRect`) pads it with the profile's node padding. A stereotype
 * on a plain oval or a box is folded over the label as a line of its own (v12 drew
 * `«s»<br/>label`); a business oval keeps it 2px above.
 */
function useCaseView(
  useCase: UsecaseUseCase,
  parent: string | undefined,
  font: FontKey,
  config: UsecaseLayoutConfig,
  m: Measure
): UseCaseView {
  const style = m.styleOf(useCase.classes, useCase.styles);
  const label = m.label(useCase.label, font, config.wrappingWidth, style, useCase.labelType);
  const stereotype =
    useCase.stereotype !== undefined
      ? m.label(`«${useCase.stereotype}»`, font, config.wrappingWidth, style)
      : undefined;
  const business = useCase.shape === 'ellipse' && useCase.business;
  const stereotypeGap = stereotype && business ? PX.ellipse.stereotypeGap : 0;
  const block = {
    width: Math.max(label.width, stereotype?.width ?? 0, config.minNodeWidth),
    height: label.height + (stereotype ? stereotype.height + stereotypeGap : 0),
  };
  const pad =
    useCase.shape === 'ellipse'
      ? { x: PX.ellipse.inset, y: PX.ellipse.inset }
      : pxProfile.builder.nodePad;
  return withParent(
    {
      kind: 'usecase',
      id: useCase.astId,
      useCase,
      shape: useCase.shape,
      font,
      label,
      ...(stereotype ? { stereotype } : {}),
      stereotypeGap,
      block,
      style,
      width: block.width + 2 * pad.x,
      height: block.height + 2 * pad.y,
    } satisfies UseCaseView,
    parent
  );
}

/** v12's generic `note` shape: the label, at least `minNodeWidth` wide, padded. */
function noteView(
  note: UsecaseNote,
  target: string,
  font: FontKey,
  config: UsecaseLayoutConfig,
  m: Measure
): NoteView {
  const style = m.styleOf([]);
  const label = m.label(note.label, font, config.wrappingWidth, style, note.labelType);
  const pad = PX.note.pad;
  return {
    kind: 'note',
    id: note.astId,
    note,
    label,
    target,
    style,
    width: Math.max(label.width, config.minNodeWidth) + 2 * pad,
    height: label.height + 2 * pad,
  };
}

/**
 * v12 `usecaseJsonTable`: a title row (the id, at least `minNodeWidth` wide), then one row per
 * key and value, each cell padded; the value column takes what the title leaves over.
 */
function jsonView(
  table: UsecaseJsonTable,
  font: FontKey,
  config: UsecaseLayoutConfig,
  m: Measure
): JsonTableView {
  const J = PX.json;
  const style = m.styleOf(table.classes, table.styles);
  const title = m.label(table.id, font, Infinity, style);
  const cells = table.rows.map((row) => ({
    row,
    key: m.label(row.key, font, J.cellWrap, style),
    value: m.label(row.value, font, J.cellWrap, style),
  }));
  let keys = 0;
  let values = 0;
  for (const c of cells) {
    keys = Math.max(keys, c.key.width);
    values = Math.max(values, c.value.width);
  }
  const keyWidth = keys + 2 * J.cellPadX;
  const titleWidth = Math.max(title.width, config.minNodeWidth) + 2 * J.cellPadX;
  const inner = Math.max(titleWidth, keyWidth + values + 2 * J.cellPadX);
  const titleHeight = title.height + 2 * J.cellPadY;
  let top = J.border + titleHeight;
  const rows = cells.map((c): JsonRowView => {
    const height = Math.max(c.key.height, c.value.height) + 2 * J.cellPadY;
    const view = { ...c, top, height };
    top += height;
    return view;
  });
  return {
    kind: 'json',
    id: table.astId,
    table,
    title,
    style,
    border: J.border,
    titleHeight,
    keyWidth,
    valueWidth: inner - keyWidth,
    rows,
    width: inner + 2 * J.border,
    height: top + J.border,
  };
}

/** v12 `usecaseSystemBoundary`: the title over the content; a package's in its tab. */
function boundaryView(boundary: UsecaseBoundary, font: FontKey, m: Measure): BoundaryView {
  const B = PX.boundary;
  const style = m.styleOf(boundary.classes, boundary.styles);
  const label = m.label(boundary.label, font, B.titleWrap, style, boundary.labelType);
  const view: BoundaryView = { id: boundary.astId, boundary, label, style };
  if (boundary.type !== 'package') return view;
  return {
    ...view,
    tab: {
      width: Math.max(B.tabMin, label.width + B.tabWidthPad),
      height: label.height + B.tabPad,
    },
  };
}

/** The graph the layout engine gets. */
function layoutGraph(
  model: UsecaseModel,
  nodes: ReadonlyMap<string, UsecaseNodeView>,
  boundaries: readonly BoundaryView[],
  edges: readonly UsecaseEdgeView[],
  config: UsecaseLayoutConfig
): LayoutGraph {
  const b = pxProfile.builder;
  const across = sideways(model.direction);
  const pad = PX.boundary.pad;
  return {
    direction: model.direction,
    nodes: [...nodes.values()].map((v): LayoutNode => {
      const node: LayoutNode = { id: v.id, width: v.width, height: v.height, shape: v.kind };
      if (v.parent !== undefined) node.parent = v.parent;
      // Ends on an oval keep to the middle half of its side, where the oval is near the box,
      // so clipping them to the oval (`clip.ts`) moves them little.
      if (v.kind === 'usecase' && v.shape === 'ellipse')
        node.span = (across ? v.height : v.width) / 2;
      return node;
    }),
    groups: boundaries.map((g): LayoutGroup => {
      const titled = g.label.height > 0;
      const group: LayoutGroup = {
        id: g.id,
        padding: { top: pad, right: pad, bottom: pad, left: pad },
      };
      if (g.tab) group.title = { ...g.tab };
      else if (titled) group.title = { width: g.label.width, height: g.label.height };
      return group;
    }),
    edges: edges.map((e): LayoutEdge => {
      const edge: LayoutEdge = {
        id: e.id,
        source: e.source,
        target: e.target,
        minLen: e.relationship?.minlen ?? 1,
      };
      if (e.label && e.label.width > 0)
        edge.label = {
          width: e.label.width + b.labelPatch.x,
          height: e.label.height + b.labelPatch.y,
        };
      return edge;
    }),
    spacing: { node: config.nodeSpacing, rank: config.rankSpacing, edge: b.spacing.edge },
    diagramPadding: config.diagramPadding,
    headRoom: b.headRoom,
    metrics: pxProfile.engine,
  };
}
