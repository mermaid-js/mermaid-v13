import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutSankey, type SankeyLayout } from './layout/index.ts';
import type { SankeyModel } from './model.ts';
import { parseSankey, type SankeyParseResult } from './parser/index.ts';
import { renderSankey } from './render/render.ts';

/**
 * v12's detector (`sankeyDetector.ts`, `/^\s*sankey(-beta)?/`): case-sensitive, no word
 * boundary, on the text the pipeline hands `detector` (front matter, directives and `%%`
 * comments already removed). `detectSankey` (`parser/detect.ts`) is the same test on a raw
 * source, for callers that hold the text before preprocessing (conformance, editors).
 */
const DETECT = /^\s*sankey/;

/**
 * The sankey plugin (DESIGN §12.1, spec #427): `layoutKind: 'custom'` with its own
 * `SankeyLayout`. `parse` takes the whole source; `layout` runs d3-sankey 0.12.3's layout
 * (re-implemented) and measures the labels; `render` writes the whole `<svg>` document. SVG
 * only (D320). Labels are plain text (D395), so there is no `labels` hook, and sankey adds no
 * theme variables (D152), so there is no `theme` table (as info's). The manifest, the generated
 * `configDefaults` and the parser limits are T5's (#503).
 */
export const sankey = {
  id: 'sankey',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): SankeyParseResult =>
    parseSankey(text, { preprocessed: ctx.preprocessed }),
  layout: (model: SankeyModel, ctx: RenderContext): SankeyLayout => layoutSankey(model, ctx),
  render: (model: SankeyModel, layout: SankeyLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderSankey(model, layout, ctx, w),
} satisfies DiagramPlugin<SankeyModel, SankeyLayout>;
