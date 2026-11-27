/**
 * c4-beta layout, first half (spec #730 §Layout): a `C4BetaModel` measured and turned into a
 * `LayoutGraph` for core's `layered` engine. A leaf element is a node with its measured shape; a
 * boundary is a group at any depth with its measured header as the title; a relation is an edge
 * with its measured label. Text is measured here, in the fonts it is drawn in (pitfall 16), with
 * the shape and text metrics legacy C4 uses; the engine never measures.
 */
import type {
  LayoutEdge,
  LayoutGraph,
  LayoutGroup,
  LayoutNode,
  UnitProfile,
} from '@mermaid-js/core/layout';
import { pxProfile } from '@mermaid-js/core/layout';
import { labelledEdge } from '@mermaid-js/shared/layout';
import { Style, type FontKey } from '@mermaid-js/core/text';
import {
  c4betaDiagramPadding,
  c4betaPersonWrappingWidth,
  c4betaStereotypeShown,
  c4Fonts,
  c4LayoutConfig,
  type C4Fonts,
  type C4LayoutConfig,
} from '../config.ts';
import { cellConfig, cellPxMeasurer, cellRoom, type CellSize } from '../layout/cells.ts';
import { C4_METRICS as M, FONT_WEIGHT } from '../layout/metrics.ts';
import { labelRoomOf, type LabelRoom } from '../layout/room.ts';
import { shapeSize, type ShapeRoom } from '../layout/shapes.ts';
import {
  measureSections,
  shapeRoom,
  textMeasure,
  type C4LayoutContext,
  type Measure,
  type Measured,
} from '../layout/layout.ts';
import type { C4BaseKind, C4ElementKind } from '../model.ts';
import type { C4ShapeId } from '../layout/types.ts';
import { fieldText, joinTexts, type C4Text } from '../label-text.ts';
import type { C4BetaElement, C4BetaModel, C4BetaRelation } from './model.ts';
import { cellGraph } from './cells.ts';
import { legendEntries, measureLegend, type BetaLegend } from './legend.ts';
import { C4_BETA_METRICS as B } from './metrics.ts';

/** The context the layout reads: C4's, and the width the page offers, if it offers one. */
export type C4BetaLayoutContext = C4LayoutContext & { readonly availableWidth?: number };

/** A leaf element measured: its three text sections and its shape's size around them. */
export interface BetaLeaf {
  readonly element: C4BetaElement;
  readonly form: C4ShapeId;
  readonly sections: readonly (Measured | undefined)[];
  readonly textH: number;
  readonly dx: number;
  readonly dy: number;
  readonly w: number;
  readonly h: number;
}

/** A boundary's header measured. `head` is its height from the frame's top. */
export interface BetaFrame {
  readonly element: C4BetaElement;
  readonly header: readonly (Measured | undefined)[];
  readonly head: number;
}

/** A relation that is drawn, with its edge id and measured text. */
export interface BetaEdge {
  readonly index: number;
  readonly id: string;
  readonly relation: C4BetaRelation;
  readonly label?: Measured;
  readonly techn?: Measured;
}

export interface C4BetaPrepared {
  readonly model: C4BetaModel;
  readonly graph: LayoutGraph;
  readonly leaves: ReadonlyMap<string, BetaLeaf>;
  readonly frames: ReadonlyMap<string, BetaFrame>;
  readonly edges: readonly BetaEdge[];
  readonly title?: Measured;
  /** Set when the diagram shows a legend with at least one row. */
  readonly legend?: BetaLegend;
  readonly diagramPadding: number;
  readonly config: C4LayoutConfig;
  /**
   * Set for text output: px per cell. Text was measured in cells at this size and `graph` is in
   * cells (`grid: 1`); `placeC4Beta` reads the engine's answer back at this size (`./cells.ts`).
   */
  readonly cell?: CellSize;
  /** The room a relation's label box adds to its text, in px: the profile's `labelPatch` (D629). */
  readonly labelRoom: LabelRoom;
  /** Set when text output leaves out a legend the diagram would show. */
  readonly legendDropped?: true;
}

const STEREOTYPES: Readonly<Record<C4BetaElement['kind'], string>> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
  infrastructureNode: 'Infrastructure Node',
  group: 'Group',
  deploymentNode: 'Deployment Node',
};

/** The name an element kind goes by in the diagram: its type line's, `Software System`. */
export const kindName = (kind: C4BetaElement['kind']): string => STEREOTYPES[kind];

/** The legacy element kind whose font and colours an element takes. */
export function legacyKind(element: Pick<C4BetaElement, 'kind' | 'tags'>): C4ElementKind {
  const base = BASE_KINDS[element.kind];
  return element.tags.includes(EXTERNAL_TAG) ? `external_${base}` : base;
}

/** The tag that marks an element as outside the system (spec #730 §Model). */
const EXTERNAL_TAG = 'external';

const BASE_KINDS: Readonly<Record<C4BetaElement['kind'], C4BaseKind>> = {
  person: 'person',
  softwareSystem: 'system',
  container: 'container',
  component: 'component',
  infrastructureNode: 'container',
  group: 'container',
  deploymentNode: 'container',
};

/**
 * `[Container: techn]`, `[Person]`: the type line of a leaf. Without the stereotype (`shown`
 * false) it is the technology alone, `[techn]`, or nothing.
 */
export function stereotypeOf(
  element: Pick<C4BetaElement, 'kind' | 'technology' | 'markdown'>,
  shown = true
): C4Text {
  const name = shown ? STEREOTYPES[element.kind] : undefined;
  const techn = technologyOf(element);
  if (name === undefined) return techn ? joinTexts(['[', techn, ']']) : { text: '' };
  return techn ? joinTexts([`[${name}: `, techn, ']']) : { text: `[${name}]` };
}

/** An element's or a relation's technology as drawn; none when it is empty. */
function technologyOf(item: Pick<C4BetaElement, 'technology' | 'markdown'>): C4Text | undefined {
  const techn = fieldText(item, 'technology', item.technology);
  return techn?.text ? techn : undefined;
}

/** The header's type line: `[technology]` and `xN`, as written. */
function headerType(
  element: Pick<C4BetaElement, 'technology' | 'instances' | 'markdown'>
): C4Text | undefined {
  const techn = technologyOf(element);
  const instances = fieldText(element, 'instances', element.instances);
  const parts: (C4Text | string)[] = techn ? ['[', techn, ']'] : [];
  if (instances?.text) parts.push(...(techn ? [' x'] : ['x']), instances);
  return parts.length > 0 ? joinTexts(parts) : undefined;
}

/** The shape an element is drawn in: `style <kind or tag> shape:cylinder` wins, else its kind's. */
export function shapeOfBeta(model: C4BetaModel, element: C4BetaElement): C4ShapeId {
  let form: C4ShapeId = element.kind === 'person' ? 'person' : 'rounded';
  for (const style of model.styles) {
    if (style.target !== element.kind && !element.tags.includes(style.target)) continue;
    for (const entry of style.entries)
      if (entry.key === 'shape' && entry.value === 'cylinder') form = 'cyl';
  }
  return form;
}

interface Measuring {
  readonly config: C4LayoutConfig;
  readonly fonts: C4Fonts;
  readonly measure: Measure;
  readonly room: ShapeRoom;
  readonly stereotypeShown: (kind: C4BetaElement['kind']) => boolean;
  readonly personWrapWidth: number | undefined;
}

function measureLeaf(model: C4BetaModel, element: C4BetaElement, m: Measuring): BetaLeaf {
  const { config, fonts, measure } = m;
  const sections = measureSections(
    {
      name: fieldText(element, 'name', element.name),
      type: stereotypeOf(element, m.stereotypeShown(element.kind)),
      descr: fieldText(element, 'description', element.description),
    },
    {
      font: fonts.element(legacyKind(element)),
      config,
      measure,
      ...(element.kind === 'person' && m.personWrapWidth !== undefined
        ? { wrapWidth: m.personWrapWidth }
        : {}),
    }
  );
  const present = sections.filter((s): s is Measured => s !== undefined);
  const tw = Math.max(0, ...present.map((s) => s.text.width));
  const textH =
    present.reduce((sum, s) => sum + s.text.height, 0) +
    Math.max(0, present.length - 1) * M.sectionGap;
  const form = shapeOfBeta(model, element);
  const size = shapeSize(form, tw, textH, m.room);
  return { element, form, sections, textH, dx: size.dx, dy: size.dy, w: size.w, h: size.h };
}

/** A boundary's header (v12 `drawInsideBoundary`'s lines), and its height from the frame's top. */
function measureFrame(element: C4BetaElement, { config, fonts, measure }: Measuring): BetaFrame {
  const f = fonts.boundary;
  const wrapW = config.wrapAll ? config.width : Infinity;
  const label = measure(
    fieldText(element, 'name', element.name),
    { ...f, size: f.size + M.boundaryLabelGrow },
    wrapW,
    Style.Bold
  );
  const type = measure(headerType(element), f, wrapW);
  const descr = measure(
    fieldText(element, 'description', element.description),
    { ...f, size: Math.max(M.minFontSize, f.size - M.boundaryDescrShrink) },
    wrapW
  );
  let height = label?.text.height ?? 0;
  if (type) height += M.boundaryTypeGap + type.text.height;
  if (descr) height += M.boundaryDescrGap + descr.text.height;
  return { element, header: [label, type, descr], head: M.boundaryLabelTop + height + B.headGap };
}

/** A relation's label as drawn: `N. ` and the description. */
export function edgeLabelText(
  relation: Pick<C4BetaRelation, 'step' | 'description' | 'markdown'>
): C4Text {
  const description = fieldText(relation, 'description', relation.description) ?? { text: '' };
  return relation.step === undefined ? description : joinTexts([`${relation.step}. `, description]);
}

/** A relation's label (`N.` and the description, bold) and `[technology]` (italic), measured. */
function measureEdge(relation: C4BetaRelation, index: number, m: Measuring): BetaEdge {
  const { config, fonts, measure } = m;
  const wrapW = config.wrapAll ? M.wide : Infinity;
  const label = measure(edgeLabelText(relation), fonts.message, wrapW, Style.Bold);
  const technology = technologyOf(relation);
  const techn = measure(
    technology ? joinTexts(['[', technology, ']']) : undefined,
    fonts.message,
    wrapW,
    Style.Italic
  );
  return {
    index,
    id: `rel:${index}`,
    relation,
    ...(label ? { label } : {}),
    ...(techn ? { techn } : {}),
  };
}

/** No room round a label block: the engine's graph adds the profile's `labelPatch` itself. */
const NO_ROOM: LabelRoom = { x: 0, y: 0 };

/** The size of a relation's label block: the two texts stacked, with `room` round them. */
export function labelBlock(
  edge: Pick<BetaEdge, 'label' | 'techn'>,
  room: LabelRoom = NO_ROOM
): LayoutEdge['label'] {
  if (!edge.label && !edge.techn) return undefined;
  return {
    width: Math.max(edge.label?.text.width ?? 0, edge.techn?.text.width ?? 0) + room.x,
    height: (edge.label?.text.height ?? 0) + (edge.techn?.text.height ?? 0) + room.y,
  };
}

const ignoreWarning = (): void => undefined;

/** What `prepareC4Beta` measured, before the engine's graph is built from it. */
type Measured4 = Pick<C4BetaPrepared, 'leaves' | 'frames' | 'edges'>;

/** The graph in px: a leaf and a boundary at their measured size, spacing from the metrics. */
function pxGraph(
  model: C4BetaModel,
  { leaves, frames, edges }: Measured4,
  config: C4LayoutConfig,
  { diagramPadding, available }: { diagramPadding: number; available: number | undefined }
): LayoutGraph {
  const nodes: LayoutNode[] = [];
  const groups: LayoutGroup[] = [];
  const pad = config.c4ShapeMargin;
  for (const element of model.elements) {
    const parent = element.parent === undefined ? {} : { parent: element.parent };
    const frame = frames.get(element.id);
    const leaf = leaves.get(element.id);
    if (frame) {
      groups.push({
        id: element.id,
        ...parent,
        padding: { top: M.boundaryLabelTop, right: pad, bottom: pad, left: pad },
        title: {
          width: Math.max(0, ...frame.header.map((h) => h?.text.width ?? 0)),
          height: frame.head - M.boundaryLabelTop,
        },
      });
    } else if (leaf) nodes.push({ id: element.id, ...parent, width: leaf.w, height: leaf.h });
  }
  return {
    direction: model.direction,
    nodes,
    groups,
    edges: edges.map((e) => {
      const edge = labelledEdge(
        pxProfile.builder,
        e.id,
        e.relation.from,
        e.relation.to,
        labelBlock(e),
        1
      );
      // `Rel_Back` has its head at the source, `BiRel` at both ends (D682).
      const { start, end } = e.relation;
      if (start === 'arrow' || end === 'none')
        edge.heads = { source: start === 'arrow', target: end === 'arrow' };
      return edge;
    }),
    spacing: { node: B.nodeSpacing, rank: B.rankSpacing, edge: B.edgeSpacing },
    routing: 'stepped',
    headRoom: M.arrow + B.arrowGap,
    diagramPadding,
    ...(available !== undefined && Number.isFinite(available) && available > 0
      ? { availableWidth: available }
      : {}),
  };
}

/** What the measuring reads: the fonts, the config and the room, in px or on the cell grid. */
interface Setup {
  readonly measuring: Measuring;
  readonly fonts: C4Fonts;
  readonly family: string;
}

/** The measuring of a render: with `units` (text output) the text in cells at their size (D459). */
function setupOf(ctx: C4BetaLayoutContext, units: UnitProfile | undefined): Setup {
  const size = units?.pxPerUnit;
  const warn = ctx.warn ?? ignoreWarning;
  const config = units
    ? cellConfig(c4LayoutConfig(ctx.config), units, warn)
    : c4LayoutConfig(ctx.config);
  const family = ctx.theme.value('fontFamily');
  const fonts = c4Fonts(ctx.config, family, warn);
  const room = shapeRoom(config, ctx.theme);
  const measuring: Measuring = {
    config,
    fonts,
    measure: textMeasure(
      size ? cellPxMeasurer(ctx.measurer, size) : ctx.measurer,
      ctx.inline,
      ctx.config
    ),
    room: size ? cellRoom(room, size) : room,
    stereotypeShown: c4betaStereotypeShown(ctx.config),
    personWrapWidth: c4betaPersonWrappingWidth(ctx.config),
  };
  return { measuring, fonts, family };
}

/** Every leaf, boundary header and relation label of `model`, measured. */
function measureModel(model: C4BetaModel, m: Measuring): Measured4 {
  const leaves = new Map<string, BetaLeaf>();
  const frames = new Map<string, BetaFrame>();
  for (const element of model.elements) {
    if (element.boundary) frames.set(element.id, measureFrame(element, m));
    else leaves.set(element.id, measureLeaf(model, element, m));
  }
  const known = new Set(model.elements.map((e) => e.id));
  const edges = model.relations.flatMap((relation, index) =>
    known.has(relation.from) && known.has(relation.to) ? [measureEdge(relation, index, m)] : []
  );
  return { leaves, frames, edges };
}

/** The engine's graph: in px, or in cells on the grid for text output (`./cells.ts`). */
function graphOf(
  model: C4BetaModel,
  measured: Measured4,
  ctx: C4BetaLayoutContext,
  units: UnitProfile | undefined,
  config: C4LayoutConfig
): LayoutGraph {
  if (units === undefined)
    return pxGraph(model, measured, config, {
      diagramPadding: c4betaDiagramPadding(ctx.config),
      available: ctx.availableWidth,
    });
  const edges = measured.edges.map((e) => ({
    id: e.id,
    from: e.relation.from,
    to: e.relation.to,
    block: labelBlock(e),
  }));
  const { availableWidth } = ctx;
  return cellGraph(
    { model, ...measured, edges, ...(availableWidth === undefined ? {} : { availableWidth }) },
    units
  );
}

/**
 * Measures `model` and builds the engine's input. Pure: the model is not changed. With the cell
 * profile (`ctx.units`, text output) text is measured in cells, the graph is in cells on the
 * grid (`./cells.ts`) and the legend is left out (`legendDropped`): its swatches key colours
 * the text does not show.
 */
export function prepareC4Beta(model: C4BetaModel, ctx: C4BetaLayoutContext): C4BetaPrepared {
  const units = ctx.units?.id === 'cell' ? ctx.units : undefined;
  const { measuring, fonts, family } = setupOf(ctx, units);
  const measured = measureModel(model, measuring);
  const graph = graphOf(model, measured, ctx, units, measuring.config);
  const title = measuring.measure(model.title, titleFont(family), Infinity);
  const entries = legendEntries(model, legacyKind, kindName);
  const legend = units ? undefined : measureLegend(entries, fonts, measuring.measure);
  return {
    model,
    graph,
    ...measured,
    ...(title ? { title } : {}),
    ...(legend ? { legend } : {}),
    diagramPadding: graph.diagramPadding ?? c4betaDiagramPadding(ctx.config),
    config: measuring.config,
    labelRoom: labelRoomOf(units),
    ...(units ? { cell: units.pxPerUnit } : {}),
    ...(units && entries.length > 0 ? { legendDropped: true as const } : {}),
  };
}

const titleFont = (family: string): FontKey => ({
  family,
  size: M.titleFontSize,
  weight: FONT_WEIGHT.normal,
});
