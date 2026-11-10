// The colours the wardley renderer draws with (spec #430 "Renderer (T4)", D215, D227, D426):
// wardley's own variables from the plugin's theme table, and v12's fixed literals where D426
// keeps them. Each name is written as a literal, so the vocabulary `usedBy` scan
// (`theme-used-by.spec.ts`) sees it. Wardley has no theme-name or `look` branch (D227).
import type { RenderContext } from '@mermaid-js/core';
import { fixedPaint, type Paint } from '@mermaid-js/core/svg';
import type { WardleyLayout } from '../layout/index.ts';

type Theme = RenderContext['theme'];

/**
 * v12's literals (`wardleyRenderer.ts`), kept by D426: the strategy overlays, the build
 * overlay's stroke, the market circles and the (de)accelerators' fill.
 */
export const FIXED = {
  outsource: fixedPaint('#666'),
  buy: fixedPaint('#ccc'),
  build: fixedPaint('#eee'),
  buildStroke: fixedPaint('#000'),
  white: fixedPaint('white'),
} as const;

export interface Paints {
  readonly background: Paint;
  /** The axes, the stage dividers (D426) and the pipeline boxes. */
  readonly axis: Paint;
  /** The title, axis and stage labels, link labels, notes, (de)accelerator labels, anchors (D426). */
  readonly axisText: Paint;
  readonly grid: Paint;
  readonly componentFill: Paint;
  /** Glyphs, overlays, market marks, inertia bars and (de)accelerator outlines. */
  readonly componentStroke: Paint;
  readonly componentLabel: Paint;
  /** Links, their heads and the pipeline joins. */
  readonly link: Paint;
  /** Trends and their heads. */
  readonly evolution: Paint;
  /** The annotation markers and box (D426). */
  readonly annotationStroke: Paint;
  readonly annotationText: Paint;
  readonly annotationFill: Paint;
}

/** `currentColor`, for a paint nothing drawn uses, so that its alias is not declared. */
const UNUSED = 'currentColor' as Paint;

/**
 * Every paint the map uses, read before the root is written so that it declares their
 * aliases: only the ones something drawn uses.
 */
export function paints(theme: Theme, layout: WardleyLayout): Paints {
  const read = (name: string, used: boolean): Paint => (used ? theme.color(name) : UNUSED);
  const { nodes } = layout;
  const arrows = layout.accelerators.length + layout.deaccelerators.length > 0;
  const annotated = layout.annotations.length > 0 || layout.annotationsBox !== undefined;
  return {
    background: theme.color('wardleyBackgroundColor'),
    axis: theme.color('wardleyAxisColor'),
    axisText: theme.color('wardleyAxisTextColor'),
    grid: read('wardleyGridColor', layout.grid.length > 0),
    componentFill: read(
      'wardleyComponentFill',
      nodes.some((n) => n.glyph !== 'none')
    ),
    componentStroke: read('wardleyComponentStroke', nodes.length > 0 || arrows),
    componentLabel: read(
      'wardleyComponentLabelColor',
      nodes.some((n) => n.className !== 'anchor')
    ),
    link: read(
      'wardleyLinkStroke',
      layout.links.length > 0 || layout.pipelines.some((p) => p.joins.length > 0)
    ),
    evolution: read('wardleyEvolutionStroke', layout.trends.length > 0),
    annotationStroke: read('wardleyAnnotationStroke', annotated),
    annotationText: read('wardleyAnnotationTextColor', annotated),
    annotationFill: read('wardleyAnnotationFill', annotated),
  };
}
