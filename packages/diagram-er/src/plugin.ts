import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { erConfigDefaults } from './generated/config-defaults.ts';
import type { ErRenderContext } from './layout/context.ts';
import { layoutEr, type ErLayout } from './layout/layout.ts';
import { detectEr, parseEr, type ErModel, type ErParseResult } from './parser/index.ts';
import { renderEr } from './render/render.ts';

/** The pipeline's limits, or the ones the integrator config implies. */
const limits = (ctx: DiagramParseContext): Readonly<Limits> =>
  ctx.limits ?? resolveLimits(ctx.config);

/**
 * The ER diagram plugin (DESIGN §12.1). `parse` takes the whole source (front matter
 * included); every range is into the source. `layout` measures and lays out (DESIGN §6.1);
 * `render` writes the whole `<svg>` document into the writer. `configDefaults` are the `er`
 * section's generated defaults (v12's: nodeSpacing 140, rankSpacing 80, …).
 */
export const er = {
  id: 'er',
  // Text output is the lazily loaded `./ascii` entry (manifest key `ascii`, #136).
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'graph' as const,
  configDefaults: erConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectEr(text),
  parse: (text: string, ctx: DiagramParseContext): ErParseResult => {
    const caps = limits(ctx);
    return parseEr(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: caps.maxEdges,
      maxNodes: caps.maxNodes,
      maxDepth: caps.maxDepth,
    });
  },
  layout: (model: ErModel, ctx: ErRenderContext): ErLayout => layoutEr(model, ctx),
  render: (model: ErModel, layout: ErLayout, ctx: ErRenderContext, w: SvgWriter): void =>
    renderEr(model, layout, ctx, w),
} satisfies DiagramPlugin<ErModel, ErLayout>;
