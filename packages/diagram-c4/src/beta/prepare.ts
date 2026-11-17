/**
 * c4-beta layout, first half (spec #730 §Layout): a `C4BetaModel` measured and turned into a
 * `LayoutGraph` for core's `layered` engine. A leaf element is a node with its measured shape; a
 * boundary is a group at any depth with its measured header as the title; a relation is an edge
 * with its measured label. Text is measured here, in the fonts it is drawn in (pitfall 16), with
 * the shape and text metrics legacy C4 uses; the engine never measures.
 */
import type { LayoutEdge, LayoutGraph, LayoutGroup, LayoutNode } from '@mermaid-js/core/layout';
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
import { C4_METRICS as M, FONT_WEIGHT } from '../layout/metrics.ts';
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
import type { C4BetaElement, C4BetaModel, C4BetaRelation } from './model.ts';
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
  element: Pick<C4BetaElement, 'kind' | 'technology'>,
  shown = true
): string {
  const name = shown ? STEREOTYPES[element.kind] : undefined;
  if (name === undefined) return element.technology ? `[${element.technology}]` : '';
  return element.technology ? `[${name}: ${element.technology}]` : `[${name}]`;
}

/** The header's type line: `[technology]` and `xN`, as written. */
function headerType(element: Pick<C4BetaElement, 'technology' | 'instances'>): string | undefined {
  const parts = [
    element.technology ? `[${element.technology}]` : '',
    element.instances ? `x${element.instances}` : '',
  ].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(' ') : undefined;
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
      name: element.name,
      type: stereotypeOf(element, m.stereotypeShown(element.kind)),
      descr: element.description,
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
    element.name,
    { ...f, size: f.size + M.boundaryLabelGrow },
    wrapW,
    Style.Bold
  );
  const type = measure(headerType(element), f, wrapW);
  const descr = measure(
    element.description,
    { ...f, size: Math.max(M.minFontSize, f.size - M.boundaryDescrShrink) },
    wrapW
  );
  let height = label?.text.height ?? 0;
  if (type) height += M.boundaryTypeGap + type.text.height;
  if (descr) height += M.boundaryDescrGap + descr.text.height;
  return { element, header: [label, type, descr], head: M.boundaryLabelTop + height + B.headGap };
}

/** A relation's label (`N.` and the description, bold) and `[technology]` (italic), measured. */
function measureEdge(relation: C4BetaRelation, index: number, m: Measuring): BetaEdge {
  const { config, fonts, measure } = m;
  const wrapW = config.wrapAll ? M.wide : Infinity;
  const step = relation.step === undefined ? '' : `${relation.step}. `;
  const label = measure(step + relation.description, fonts.message, wrapW, Style.Bold);
  const techn = measure(
    relation.technology ? `[${relation.technology}]` : undefined,
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

/** The size of a relation's label block: the two texts stacked, `labelPad` wider than the wider. */
export function labelBlock(edge: Pick<BetaEdge, 'label' | 'techn'>): LayoutEdge['label'] {
  if (!edge.label && !edge.techn) return undefined;
  return {
    width: Math.max(edge.label?.text.width ?? 0, edge.techn?.text.width ?? 0) + M.labelPad,
    height: (edge.label?.text.height ?? 0) + (edge.techn?.text.height ?? 0),
  };
}

const ignoreWarning = (): void => undefined;

/** Measures `model` and builds the engine's input. Pure: the model is not changed. */
export function prepareC4Beta(model: C4BetaModel, ctx: C4BetaLayoutContext): C4BetaPrepared {
  const config = c4LayoutConfig(ctx.config);
  const family = ctx.theme.value('fontFamily');
  const fonts = c4Fonts(ctx.config, family, ctx.warn ?? ignoreWarning);
  const measuring: Measuring = {
    config,
    fonts,
    measure: textMeasure(ctx.measurer, ctx.inline),
    room: shapeRoom(config, ctx.theme),
    stereotypeShown: c4betaStereotypeShown(ctx.config),
    personWrapWidth: c4betaPersonWrappingWidth(ctx.config),
  };
  const leaves = new Map<string, BetaLeaf>();
  const frames = new Map<string, BetaFrame>();
  const nodes: LayoutNode[] = [];
  const groups: LayoutGroup[] = [];
  const pad = config.c4ShapeMargin;
  for (const element of model.elements) {
    const parent = element.parent === undefined ? {} : { parent: element.parent };
    if (element.boundary) {
      const frame = measureFrame(element, measuring);
      frames.set(element.id, frame);
      groups.push({
        id: element.id,
        ...parent,
        padding: { top: M.boundaryLabelTop, right: pad, bottom: pad, left: pad },
        title: {
          width: Math.max(0, ...frame.header.map((h) => h?.text.width ?? 0)),
          height: frame.head - M.boundaryLabelTop,
        },
      });
    } else {
      const leaf = measureLeaf(model, element, measuring);
      leaves.set(element.id, leaf);
      nodes.push({ id: element.id, ...parent, width: leaf.w, height: leaf.h });
    }
  }
  const known = new Set(model.elements.map((e) => e.id));
  const edges = model.relations.flatMap((relation, index) =>
    known.has(relation.from) && known.has(relation.to)
      ? [measureEdge(relation, index, measuring)]
      : []
  );
  const diagramPadding = c4betaDiagramPadding(ctx.config);
  const available = ctx.availableWidth;
  const graph: LayoutGraph = {
    direction: model.direction,
    nodes,
    groups,
    edges: edges.map((e) => {
      const label = labelBlock(e);
      return {
        id: e.id,
        source: e.relation.from,
        target: e.relation.to,
        minLen: 1,
        ...(label ? { label } : {}),
      };
    }),
    spacing: { node: B.nodeSpacing, rank: B.rankSpacing, edge: B.edgeSpacing },
    routing: 'stepped',
    headRoom: M.arrow + B.arrowGap,
    diagramPadding,
    ...(available !== undefined && Number.isFinite(available) && available > 0
      ? { availableWidth: available }
      : {}),
  };
  const title = measuring.measure(model.title, titleFont(family), Infinity);
  const legend = measureLegend(
    legendEntries(model, legacyKind, kindName),
    fonts,
    measuring.measure
  );
  return {
    model,
    graph,
    leaves,
    frames,
    edges,
    ...(title ? { title } : {}),
    ...(legend ? { legend } : {}),
    diagramPadding,
    config,
  };
}

const titleFont = (family: string): FontKey => ({
  family,
  size: M.titleFontSize,
  weight: FONT_WEIGHT.normal,
});
