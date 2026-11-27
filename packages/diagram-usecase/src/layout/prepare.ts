// UsecaseModel → LayoutGraph (DESIGN §6.1, spec #517 T3): every node measured before layout, in
// the font its label is drawn in (pitfall 16), as v12's `getData` and shapes size them. Actors
// are a glyph with the labels below and take no least width; use cases, notes and JSON tables
// are at least `minNodeWidth` wide. Boundaries are groups with the title in the top padding. A
// note joins its target through an internal dotted edge. Every length comes from the unit
// profile's sizing (`sizing.ts`: in px the metrics table, the config or core's px profile,
// pitfall 13: `usecase-layout-literals.spec.ts`; in cells, text output's D478 forms, T7).
import type { LayoutEdge, LayoutGraph, LayoutGroup, LayoutNode } from '@mermaid-js/core/layout';
import { labelledEdge } from '@mermaid-js/shared/layout';
import { curveResolver, curveRouting, type CurveKind } from '@mermaid-js/shared/svg/route';
import type { CheckedStyle } from '@mermaid-js/core/svg';
import { styleCache } from '@mermaid-js/shared/svg/document';
import {
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import { USECASE_STYLE_IGNORED } from '../codes.ts';
import {
  FONT_WEIGHT,
  fontWeight,
  MAX_LENGTH,
  usecaseLayoutConfig,
  type ConfigFont,
  type UsecaseLayoutConfig,
} from '../config.ts';
import type {
  UsecaseActor,
  UsecaseArrowType,
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
import { USECASE_CURVE } from './curve.ts';
import { PX } from './metrics.ts';
import { ANGLE_QUOTES, sizingOf, type Quotes, type Sizing } from './sizing.ts';

/** Fields every node view has. */
interface NodeViewBase {
  /** Layout node id: the element's AST id. */
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** `default`, then the element's classes (v12's `cssCompiledStyles`), then its `style`. */
  readonly style: CheckedStyle;
  /** The font its labels were measured in, so are drawn in (pitfall 16): the style's applied. */
  readonly font: FontKey;
  /** Layout group id of its boundary. */
  readonly parent?: string;
}

/** An actor: the glyph, then the stereotype and the name under it, padded round. */
export interface ActorView extends NodeViewBase {
  readonly kind: 'actor';
  readonly actor: UsecaseActor;
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
  /** What the title and the key cells leave, the divider between key and value taken off. */
  readonly valueWidth: number;
  readonly rows: readonly JsonRowView[];
}

export type UsecaseNodeView = ActorView | UseCaseView | NoteView | JsonTableView;

/** An oval use case (plain or business): its edge ends are clipped to the oval (`clip.ts`). */
export function isOval(view: UsecaseNodeView | undefined): boolean {
  return view?.kind === 'usecase' && view.shape === 'ellipse';
}

export interface BoundaryView {
  /** Layout group id: the boundary's AST id. */
  readonly id: string;
  readonly boundary: UsecaseBoundary;
  readonly label: MeasuredLabel;
  readonly style: CheckedStyle;
  readonly font: FontKey;
  /** A `package` boundary's tab, at its top left; the title is centred in it. */
  readonly tab?: { readonly width: number; readonly height: number };
}

/** What a line ends in: v12's classic point, circle and cross, a generalization's triangle. */
export type MarkerType = 'none' | 'point' | 'circle' | 'cross' | 'extension';

/** The markers at each end of a line, at its `source` and its `target`. */
export interface EndMarkers {
  readonly start: MarkerType;
  readonly end: MarkerType;
}

const NO_MARKERS: EndMarkers = { start: 'none', end: 'none' };

const ASSOCIATION: Readonly<Record<UsecaseArrowType, EndMarkers>> = {
  point: { start: 'none', end: 'point' },
  reversedPoint: { start: 'point', end: 'none' },
  line: NO_MARKERS,
  circle: { start: 'none', end: 'circle' },
  cross: { start: 'none', end: 'cross' },
  reversedCircle: { start: 'circle', end: 'none' },
  reversedCross: { start: 'cross', end: 'none' },
};

/** The markers of a relationship (v12 `associationMarkers`, `relationshipVisuals`). */
function markersOf(r: UsecaseRelationship): EndMarkers {
  if (r.type === 'generalization') return { start: 'none', end: 'extension' };
  if (r.type !== 'association') return { start: 'none', end: 'point' };
  return ASSOCIATION[r.arrowType];
}

interface EdgeViewBase {
  /** Layout ids of the ends. */
  readonly source: string;
  readonly target: string;
  /** Include, extend and note edges are dotted (v12 `pattern: 'dotted'`). */
  readonly dotted: boolean;
  /** What each end draws; a note's line has none. Every output draws these. */
  readonly markers: EndMarkers;
  readonly style: CheckedStyle;
}

/** A relationship. */
export interface RelationEdgeView extends EdgeViewBase {
  /** Layout edge id: the relationship's AST id. */
  readonly id: string;
  readonly kind: 'relation';
  readonly relationship: UsecaseRelationship;
  /** As drawn: `«include»`, `«extend»`, or an association's label. */
  readonly label?: MeasuredLabel;
  /** The font the label was measured in. */
  readonly font: FontKey;
}

/**
 * A note to its target, dotted with no markers (v12's internal edge, {@link noteEdgeId}). `source` is the
 * note and `target` its target, or the other way round where the note goes in the rank after its
 * target (`notes.ts`): the ends are the graph edge's.
 */
export interface NoteEdgeView extends EdgeViewBase {
  /** Layout edge id: {@link noteEdgeId} of the note's AST id. */
  readonly id: string;
  readonly kind: 'note';
  readonly note: UsecaseNote;
}

export type UsecaseEdgeView = RelationEdgeView | NoteEdgeView;

/** A note's line, by the note's id: v12's internal edge id, `<id>-edge`. */
export const noteEdgeId = (id: string): string => `${id}-edge`;

/** The AST id of what an edge draws: the relationship's, or the note's for its line. */
export const edgeAstId = (e: UsecaseEdgeView): string =>
  e.kind === 'relation' ? e.relationship.astId : e.note.astId;

export interface UsecasePrepared {
  readonly graph: LayoutGraph;
  /** By layout id, in graph order (actors, use cases, notes, JSON tables). */
  readonly nodes: ReadonlyMap<string, UsecaseNodeView>;
  /** Model id → layout id, for actors, use cases and JSON tables (what relations name). */
  readonly layoutIds: ReadonlyMap<string, string>;
  readonly boundaries: readonly BoundaryView[];
  readonly edges: readonly UsecaseEdgeView[];
  readonly config: UsecaseLayoutConfig;
  /**
   * The curve of every relationship and note line but a self-loop's (D733): `usecase.curve`,
   * then the top-level `curve`, then {@link USECASE_CURVE}.
   */
  readonly curve: CurveKind;
  /**
   * The front-matter title (D472), in the theme's font, unwrapped. The graph leaves room for
   * none: the renderer draws it above the laid-out diagram.
   */
  readonly title?: MeasuredLabel;
}

/** A stereotype as drawn: `«s»` (`<<s>>` with ASCII `quotes`). */
export const stereotypeText = (s: string, [open, close]: Quotes = ANGLE_QUOTES): string =>
  `${open}${s}${close}`;

/**
 * A relationship's label as v12 drew it: `«include»`, `«extend»` (`<<include>>` with ASCII
 * `quotes`), an association's label.
 */
export function relationText(
  r: UsecaseRelationship,
  quotes: Quotes = ANGLE_QUOTES
): string | undefined {
  if (r.type === 'include' || r.type === 'extend') return stereotypeText(r.type, quotes);
  if (r.type === 'association' && r.label) return r.label;
  return undefined;
}

const sideways = (d: UsecaseModel['direction']): boolean => d === 'LR' || d === 'RL';

interface Measure {
  /** The font a label is drawn in: `font` with the style's size, weight. */
  font(font: FontKey, style: CheckedStyle): FontKey;
  /** Measures `text` in `font` (already styled, see `font`), wrapped at `max`. */
  label(
    text: string,
    font: FontKey,
    max: number,
    style: CheckedStyle,
    type?: UsecaseLabelType
  ): MeasuredLabel;
  styleOf(classes: readonly string[], own?: readonly string[]): CheckedStyle;
}

/** The fonts the views start from, before an element's style. */
interface Fonts {
  /** Actor labels and stereotypes (`actorFont*`). */
  readonly actor: FontKey;
  /** Use case labels and stereotypes (`usecaseFont*`). */
  readonly usecase: FontKey;
  /** Notes, JSON tables, boundary titles: the theme's font. */
  readonly base: FontKey;
  /** Edge labels: the theme's family at v12's 10px. */
  readonly edge: FontKey;
}

/** What every view builder reads. */
interface ViewInputs {
  readonly fonts: Fonts;
  readonly measure: Measure;
  readonly sizing: Sizing;
}

/** A config font in the theme's family when it names none. */
function fontOf(font: ConfigFont, family: string): FontKey {
  return { family: font.family ?? family, size: font.size, weight: font.weight };
}

/** Text style bits a style sets (italics; weight and size go in the font). */
const styleBits = (style: CheckedStyle): number =>
  style.text['font-style'] === 'italic' ? Style.Italic : 0;

/**
 * A plain label as text: v12 escaped `&`, `<` and `>` in every plain label, stereotype, JSON cell
 * and edge label (`usecaseRenderer.ts` `escapePlainLabel`), so its markup showed as written.
 * Core's label layout decodes the entities back to those characters, as text, so `<b>` and
 * `<img …>` stay text and only Markdown labels read the HTML subset.
 */
const escapePlain = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Builds the measure: styled fonts (one warning per size it cannot use), labels, styles. */
function measureFor(model: UsecaseModel, ctx: UsecaseLayoutContext): Measure {
  const warned = new Set<string>();
  return {
    font(font, style) {
      const t = style.text;
      const weight = fontWeight(t['font-weight']) ?? font.weight;
      const given = t['font-size'];
      if (given === undefined) return { ...font, weight };
      const size = fontSizePx(given, font.size);
      if (size !== undefined && size > 0 && size < MAX_LENGTH) return { ...font, size, weight };
      const text = String(given);
      if (!warned.has(text)) {
        warned.add(text);
        ctx.warn({
          code: USECASE_STYLE_IGNORED,
          message: `Ignored font-size ${JSON.stringify(text)}: the usecase layout cannot measure it; using ${font.size}px`,
        });
      }
      return { ...font, weight };
    },
    label: (text, font, max, style, type = 'text') =>
      layoutLabel(type === 'markdown' ? text : escapePlain(text), font, max, ctx.measurer, {
        markdown: type === 'markdown',
        style: styleBits(style),
        inline: ctx.inline,
        // v12's HTML labels kept a long word whole (#649); in cells it is split to fit its box.
        keepWords: ctx.units?.id !== 'cell',
      }),
    styleOf: styleCache(new Map(model.classDefs.map((c) => [c.id, c.styles])), (w) => ctx.warn(w), [
      'default',
    ]),
  };
}

/**
 * Measures the model and builds the graph the layout engine gets.
 */
export function prepareUsecase(model: UsecaseModel, ctx: UsecaseLayoutContext): UsecasePrepared {
  const config = usecaseLayoutConfig(
    ctx.config.usecase as Readonly<Record<string, unknown>> | undefined,
    (w) => ctx.warn(w)
  );
  const curve = curveResolver(ctx.config.curve, USECASE_CURVE, (w) => ctx.warn(w))(
    ctx.config.usecase?.curve
  );
  const family = ctx.theme.value('fontFamily');
  const base: FontKey = { family, size: ctx.theme.number('fontSize'), weight: FONT_WEIGHT.normal };
  const parts: ViewInputs = {
    fonts: {
      actor: fontOf(config.actorFont, family),
      usecase: fontOf(config.usecaseFont, family),
      base,
      edge: { ...base, size: PX.edgeFontSize },
    },
    measure: measureFor(model, ctx),
    sizing: sizingOf(config, ctx),
  };

  const boundaryOf = new Map<string, string>();
  for (const b of model.boundaries) boundaryOf.set(b.id, b.astId);
  const parentOf = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : boundaryOf.get(id);

  const nodes = new Map<string, UsecaseNodeView>();
  const layoutIds = new Map<string, string>();
  for (const a of model.actors) {
    const v = actorView(a, parentOf(a.parentId), parts);
    nodes.set(v.id, v);
    layoutIds.set(a.id, v.id);
  }
  for (const u of model.useCases) {
    const v = useCaseView(u, parentOf(u.parentId), parts);
    nodes.set(v.id, v);
    layoutIds.set(u.id, v.id);
  }
  const notes: NoteView[] = [];
  for (const n of model.notes) {
    const target = layoutIds.get(n.target);
    if (target === undefined) continue;
    const v = noteView(n, target, parts);
    nodes.set(v.id, v);
    notes.push(v);
  }
  for (const t of model.jsonTables) {
    const v = jsonView(t, parts);
    nodes.set(v.id, v);
    layoutIds.set(t.id, v.id);
  }

  const boundaries = model.boundaries.map((b) => boundaryView(b, parts));

  const edges: UsecaseEdgeView[] = [];
  for (const r of model.relationships) {
    const source = layoutIds.get(r.source);
    const target = layoutIds.get(r.target);
    if (source === undefined || target === undefined) continue;
    edges.push(relationView(r, source, target, parts));
  }
  for (const n of notes) {
    edges.push({
      id: noteEdgeId(n.id),
      kind: 'note',
      note: n.note,
      source: n.id,
      target: n.target,
      dotted: true,
      markers: NO_MARKERS,
      style: parts.measure.styleOf([]),
    });
  }

  const graph = layoutGraph(
    { direction: model.direction, nodes, boundaries, edges },
    config,
    parts.sizing,
    curve
  );
  const text = model.title?.trim();
  const plain = parts.measure.styleOf([]);
  const title = text ? parts.measure.label(text, base, Infinity, plain) : undefined;
  return {
    graph,
    nodes,
    layoutIds,
    boundaries,
    edges,
    config,
    curve,
    ...(title ? { title } : {}),
  };
}

function withParent<T extends object>(view: T, parent: string | undefined): T {
  return parent === undefined ? view : { ...view, parent };
}

/** v12 `renderUsecaseActor`: the glyph, the stereotype and the name, padded; no least width. */
function actorView(actor: UsecaseActor, parent: string | undefined, parts: ViewInputs): ActorView {
  const { measure, sizing } = parts;
  const actorPx = sizing.actor;
  const style = measure.styleOf(actor.classes, actor.styles);
  const font = measure.font(parts.fonts.actor, style);
  const label = measure.label(actor.label, font, sizing.wrap, style, actor.labelType);
  const stereotype = stereotypeOf(actor.stereotype, font, style, parts);
  const glyphTop = actorPx.pad;
  const stereotypeTop = glyphTop + actorPx.glyphHeight + actorPx.labelGap;
  const labelTop = stereotypeTop + (stereotype ? stereotype.height + actorPx.stereotypeGap : 0);
  return withParent(
    {
      kind: 'actor',
      id: actor.astId,
      actor,
      font,
      label,
      ...(stereotype ? { stereotype } : {}),
      style,
      width: Math.max(actorPx.glyphWidth, label.width, stereotype?.width ?? 0) + 2 * actorPx.pad,
      height: labelTop + label.height + actorPx.pad,
      glyphTop,
      stereotypeTop,
      labelTop,
    } satisfies ActorView,
    parent
  );
}

/** `«stereotype»`, measured as a label of its own. */
function stereotypeOf(
  text: string | undefined,
  font: FontKey,
  style: CheckedStyle,
  { measure, sizing }: ViewInputs
): MeasuredLabel | undefined {
  if (text === undefined) return undefined;
  return measure.label(stereotypeText(text, sizing.quotes), font, sizing.wrap, style);
}

/**
 * v12 `usecaseEllipse` / `usecaseBusiness`: the oval is the label block plus `inset` each side;
 * a `[rect]` use case (v12 `squareRect`) pads it with the profile's node padding. A stereotype
 * on a plain oval or a box is folded over the label as a line of its own (v12 drew
 * `«s»<br/>label`); a business oval keeps it 2px above. In cells (D478) a box, rounded for an
 * oval, whose label rows are written `( label )` (`[ label ]`): its sides take a cell each, and
 * the profile's node padding is inside them. The top and bottom rows give an LR end a side cell
 * off the corners (D140).
 */
function useCaseView(
  useCase: UsecaseUseCase,
  parent: string | undefined,
  parts: ViewInputs
): UseCaseView {
  const { measure, sizing } = parts;
  const style = measure.styleOf(useCase.classes, useCase.styles);
  const font = measure.font(parts.fonts.usecase, style);
  const label = measure.label(useCase.label, font, sizing.wrap, style, useCase.labelType);
  const stereotype = stereotypeOf(useCase.stereotype, font, style, parts);
  const business = useCase.shape === 'ellipse' && useCase.business;
  const stereotypeGap = stereotype && business ? sizing.businessGap : 0;
  const lines = label.height + (stereotype ? stereotype.height + stereotypeGap : 0);
  const block = {
    width: Math.max(label.width, stereotype?.width ?? 0, sizing.minWidth),
    height: Math.max(lines, sizing.minBlockHeight),
  };
  const pad = useCase.shape === 'ellipse' ? sizing.ovalPad : sizing.rectPad;
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
function noteView(note: UsecaseNote, target: string, parts: ViewInputs): NoteView {
  const { measure, sizing } = parts;
  const style = measure.styleOf([]);
  const font = measure.font(parts.fonts.base, style);
  const label = measure.label(note.label, font, sizing.wrap, style, note.labelType);
  const pad = sizing.notePad;
  return {
    kind: 'note',
    id: note.astId,
    note,
    label,
    target,
    style,
    font,
    width: Math.max(label.width, sizing.minWidth) + 2 * pad.x,
    height: label.height + 2 * pad.y,
  };
}

/**
 * v12 `usecaseJsonTable`: a title row (the id, at least `minNodeWidth` wide), then one row per
 * key and value, each cell padded; the value column takes what the title leaves over. In cells
 * (D478) a key/value box as ER's tables: a border, a rule under the title and a divider between
 * the columns take a cell each, and the cells take the profile's node padding.
 */
function jsonView(table: UsecaseJsonTable, parts: ViewInputs): JsonTableView {
  const { measure, sizing } = parts;
  const jsonPx = sizing.json;
  const style = measure.styleOf(table.classes, table.styles);
  const font = measure.font(parts.fonts.base, style);
  const title = measure.label(table.id, font, Infinity, style);
  const cells = table.rows.map((row) => ({
    row,
    key: measure.label(row.key, font, sizing.cellWrap, style),
    value: measure.label(row.value, font, sizing.cellWrap, style),
  }));
  const rule = cells.length > 0 ? jsonPx.rule : 0;
  let keys = 0;
  let values = 0;
  for (const c of cells) {
    keys = Math.max(keys, c.key.width);
    values = Math.max(values, c.value.width);
  }
  const keyWidth = keys + 2 * jsonPx.cellPadX;
  const titleWidth = Math.max(title.width, sizing.minWidth) + 2 * jsonPx.cellPadX;
  const inner = Math.max(titleWidth, keyWidth + jsonPx.rule + values + 2 * jsonPx.cellPadX);
  const titleHeight = title.height + 2 * jsonPx.cellPadY;
  let top = jsonPx.border + titleHeight + rule;
  const rows = cells.map((c): JsonRowView => {
    const height = Math.max(c.key.height, c.value.height) + 2 * jsonPx.cellPadY;
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
    font,
    border: jsonPx.border,
    titleHeight,
    keyWidth,
    valueWidth: inner - keyWidth - jsonPx.rule,
    rows,
    width: inner + 2 * jsonPx.border,
    height: top + jsonPx.border,
  };
}

/**
 * v12 `usecaseSystemBoundary`: the title over the content; a package's in its tab. In cells
 * (D478) every boundary is a frame with its title on the top border.
 */
function boundaryView(boundary: UsecaseBoundary, parts: ViewInputs): BoundaryView {
  const boundaryPx = PX.boundary;
  const { measure, sizing } = parts;
  const style = measure.styleOf(boundary.classes, boundary.styles);
  const font = measure.font(parts.fonts.base, style);
  const label = measure.label(boundary.label, font, sizing.titleWrap, style, boundary.labelType);
  const view: BoundaryView = { id: boundary.astId, boundary, label, style, font };
  if (boundary.type !== 'package' || !sizing.tabs) return view;
  return {
    ...view,
    tab: {
      width: Math.max(boundaryPx.tabMin, label.width + boundaryPx.tabWidthPad),
      height: label.height + boundaryPx.tabPad,
    },
  };
}

/** Whether a measured label shows nothing: no inline box and only whitespace (as `edgeLabel`). */
function blank(label: MeasuredLabel): boolean {
  return label.lines.every((line) => line.every((r) => r.kind !== 'box' && !r.text.trim()));
}

/**
 * A relationship's edge. Include and extend labels are plain text whatever the model says (v12
 * forced `labelType: 'text'` on them, `usecaseDb.ts:267-268`).
 */
function relationView(
  r: UsecaseRelationship,
  source: string,
  target: string,
  parts: ViewInputs
): RelationEdgeView {
  const { measure, sizing } = parts;
  const text = relationText(r, sizing.quotes);
  const style = measure.styleOf(r.classes, r.styles);
  const font = measure.font(parts.fonts.edge, style);
  const type = r.type === 'association' ? r.labelType : 'text';
  const label =
    text === undefined ? undefined : measure.label(text, font, sizing.edgeWrap, style, type);
  return {
    id: r.astId,
    kind: 'relation',
    relationship: r,
    source,
    target,
    dotted: r.type === 'include' || r.type === 'extend',
    markers: markersOf(r),
    // A label of only whitespace draws no tag (D626), so it takes no room either.
    ...(label && !blank(label) ? { label } : {}),
    style,
    font,
  };
}

/** What the graph is built from. */
interface Views {
  readonly direction: UsecaseModel['direction'];
  readonly nodes: ReadonlyMap<string, UsecaseNodeView>;
  readonly boundaries: readonly BoundaryView[];
  readonly edges: readonly UsecaseEdgeView[];
}

/**
 * The graph the layout engine gets: the config's spacing and margin, which the sizing may finish
 * (in cells, text output: on the grid, the spacing an author set converted), and the routing the
 * curve asks for. On the grid every edge is routed at right angles whatever it asks (D78).
 */
function layoutGraph(
  views: Views,
  config: UsecaseLayoutConfig,
  sizing: Sizing,
  curve: CurveKind
): LayoutGraph {
  const builder = sizing.units.builder;
  const across = sideways(views.direction);
  const graph: LayoutGraph = {
    direction: views.direction,
    nodes: [...views.nodes.values()].map((v): LayoutNode => {
      const node: LayoutNode = { id: v.id, width: v.width, height: v.height, shape: v.kind };
      if (v.parent !== undefined) node.parent = v.parent;
      // Ends on an oval keep to the middle half of its side, where the oval is near the box,
      // so clipping them to the oval (`clip.ts`) moves them little.
      if (isOval(v) && sizing.ovalSpan) node.span = (across ? v.height : v.width) / 2;
      return node;
    }),
    groups: views.boundaries.map((g): LayoutGroup => {
      const titled = g.tab !== undefined || g.label.height > 0;
      const { pad, titledTop } = sizing.frame;
      const group: LayoutGroup = {
        id: g.id,
        padding: { top: titled ? titledTop : pad, right: pad, bottom: pad, left: pad },
      };
      if (g.tab) group.title = { ...g.tab };
      else if (titled) group.title = { width: g.label.width, height: g.label.height };
      return group;
    }),
    edges: views.edges.map(
      (e): LayoutEdge =>
        e.kind === 'relation'
          ? labelledEdge(builder, e.id, e.source, e.target, e.label, e.relationship.minlen)
          : labelledEdge(builder, e.id, e.source, e.target, undefined)
    ),
    spacing: { node: config.nodeSpacing, rank: config.rankSpacing, edge: builder.spacing.edge },
    diagramPadding: config.diagramPadding,
    headRoom: builder.headRoom,
    metrics: sizing.units.engine,
    routing: sizing.units.grid === undefined ? curveRouting(curve) : 'stepped',
  };
  return sizing.finish ? sizing.finish(graph) : graph;
}
