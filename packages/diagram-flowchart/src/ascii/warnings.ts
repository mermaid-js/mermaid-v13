// What text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature kind
// and one `ASCII_SHAPE` warning for the shapes drawn as plain boxes. Each names the AST ids
// of what it dropped: the elements from the model, and the statements when the AST is given.
import type { GlyphSet } from '@mermaid-js/core/ascii';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { FlowModel } from '../parser/index.ts';
import type { FlowWarning } from '../render/context.ts';
import type { NodeView, Prepared } from '../render/prepare.ts';
import { textForm } from './shapes.ts';
import { flowchartConfigDefaults } from '../generated/config-defaults.ts';
import { asciiDropped, statements, styled } from '@mermaid-js/shared/ascii';
import { addsEmphasis } from '@mermaid-js/shared/svg/graph';
import type {
  AsciiDroppedWarning as SharedAsciiDroppedWarning,
  AsciiRouteWarning,
} from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature =
  | 'style'
  | 'curve'
  | 'image'
  | 'emphasis'
  | 'link'
  | 'accessibility';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

/** The shapes drawn as plain boxes because they have no text form (D82). */
export interface AsciiShapeWarning extends FlowWarning {
  readonly code: 'ASCII_SHAPE';
  readonly shapes: readonly string[];
  readonly astIds: readonly string[];
}

export type { AsciiRouteWarning };

export type AsciiWarning = AsciiDroppedWarning | AsciiShapeWarning | AsciiRouteWarning;

const DEFAULT_CURVE = flowchartConfigDefaults.curve;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, linkStyle)',
  curve: 'edge curves',
  image: 'images and icons (labels kept)',
  emphasis: 'bold and italic text',
  link: 'links, tooltips and callbacks',
  accessibility: 'accTitle and accDescr',
};

// The statements behind each feature kind (`FlowSimpleKind`).
const STATEMENTS: Record<AsciiDroppedFeature, readonly string[]> = {
  style: ['Style', 'ClassDef', 'Class', 'LinkStyle'],
  curve: ['LinkStyle'],
  image: [],
  emphasis: [],
  link: ['Click'],
  accessibility: ['AccTitle', 'AccDescr'],
};

type Found = Record<AsciiDroppedFeature, Set<string> | undefined>;

// Which features the drawing uses, with the AST ids of the elements that use them.
function features(model: FlowModel, flow: Prepared, curve: string | undefined): Found {
  const found: Found = {
    style: undefined,
    curve: undefined,
    image: undefined,
    emphasis: undefined,
    link: undefined,
    accessibility: undefined,
  };
  const add = (feature: AsciiDroppedFeature, id?: string): void => {
    const ids = (found[feature] ??= new Set());
    if (id) ids.add(id);
  };
  const views: NodeView[] = [...flow.groups, ...flow.nodes];
  const astOf = new Map(views.map((v) => [v.id, v.ast]));
  for (const v of views) {
    if (styled(v.style)) add('style', v.ast);
    if (addsEmphasis(v.label, v.style)) add('emphasis', v.ast);
    if (v.vertex?.img || v.vertex?.icon) add('image', v.ast);
  }
  for (const e of flow.edges) {
    if (styled(e.style)) add('style', e.edge.ast);
    if (addsEmphasis(e.label, e.style)) add('emphasis', e.edge.ast);
    if ((e.edge.interpolate ?? model.defaultInterpolate) !== undefined) add('curve', e.edge.ast);
  }
  // A curve set in config (site, front matter or directive) draws every edge with it in SVG.
  if (curve !== undefined && curve !== DEFAULT_CURVE) add('curve');
  for (const v of model.vertices) if (v.link) add('link', astOf.get(v.id) ?? v.ast);
  for (const [id] of model.tooltips) add('link', astOf.get(id));
  for (const c of model.callbacks) add('link', astOf.get(c.id));
  if (model.accTitle || model.accDescr) add('accessibility');
  return found;
}

/** One `ASCII_SHAPE` warning for the nodes whose shape has no text form, if any. */
function shapeWarning(flow: Prepared, glyphs: GlyphSet): AsciiShapeWarning | undefined {
  const shapes: string[] = [];
  const astIds: string[] = [];
  for (const v of flow.nodes) {
    if (textForm(v.shape, glyphs)) continue;
    if (!shapes.includes(v.shape)) shapes.push(v.shape);
    astIds.push(v.ast);
  }
  if (shapes.length === 0) return undefined;
  return {
    code: 'ASCII_SHAPE',
    shapes,
    astIds,
    message: `Text output draws these shapes as plain boxes: ${shapes.join(', ')}.`,
  };
}

/**
 * The warnings for one drawing: features without a text form (one per kind) and shapes
 * without one (D82). `ast` adds the statements' ids (`style:1`, `accTitle:1`, …).
 */
export function asciiWarnings(
  model: FlowModel,
  flow: Prepared,
  glyphs: GlyphSet,
  ast?: AstNode,
  curve?: string
): AsciiWarning[] {
  const found = features(model, flow, curve);
  const stmts = new Map<string, string[]>();
  statements(ast, stmts);
  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(WHAT) as AsciiDroppedFeature[]) {
    const ids = found[feature];
    if (!ids) continue;
    for (const kind of STATEMENTS[feature]) for (const id of stmts.get(kind) ?? []) ids.add(id);
    out.push(asciiDropped(feature, [...ids], WHAT[feature]));
  }
  const shapes = shapeWarning(flow, glyphs);
  if (shapes) out.push(shapes);
  return out;
}
