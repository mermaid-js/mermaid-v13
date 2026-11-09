import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { sankeyConfigDefaults } from './generated/config-defaults.ts';
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
 * `SankeyLayout`. `parse` takes the whole source and the integrator's node and link limits
 * (R-SEC-5); `layout` runs d3-sankey 0.12.3's layout (re-implemented) and measures the labels;
 * `render` writes the whole `<svg>` document. SVG only (D320). Labels are plain text (D395), so
 * there is no `labels` hook, and sankey adds no theme variables (D152), so there is no `theme`
 * table (as info's). The registry loads it from the package's `mermaid` manifest (#503);
 * `configDefaults` are the `sankey` section's generated defaults.
 */
export const sankey = {
  id: 'sankey',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: sankeyConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): SankeyParseResult => {
    const { maxNodes, maxEdges } = ctx.limits ?? resolveLimits(ctx.config);
    return parseSankey(text, { preprocessed: ctx.preprocessed, maxNodes, maxEdges });
  },
  layout: (model: SankeyModel, ctx: RenderContext): SankeyLayout => layoutSankey(model, ctx),
  render: (model: SankeyModel, layout: SankeyLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderSankey(model, layout, ctx, w),
} satisfies DiagramPlugin<SankeyModel, SankeyLayout>;
