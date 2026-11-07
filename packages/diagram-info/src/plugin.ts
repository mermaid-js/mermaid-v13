import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutInfo, type InfoLayout } from './layout.ts';
import type { InfoModel } from './model.ts';
import { detectInfo, parseInfo, type InfoParseResult } from './parser/index.ts';
import { renderInfo } from './render.ts';

/**
 * The info plugin (DESIGN §12.1, #420): `layoutKind: 'custom'` with its own `InfoLayout`.
 * `parse` takes the whole source; `layout` measures the version line on v12's canvas;
 * `render` writes the whole `<svg>` document. Text output is the `./ascii` entry (D320). The
 * registry loads it from the package's `mermaid` manifest. Info has no config section: v12
 * read none.
 */
export const info = {
  id: 'info',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectInfo(text),
  parse: (text: string, ctx: DiagramParseContext): InfoParseResult =>
    parseInfo(text, { preprocessed: ctx.preprocessed }),
  layout: (_model: InfoModel, ctx: RenderContext): InfoLayout => layoutInfo(ctx),
  render: (model: InfoModel, layout: InfoLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderInfo(model, layout, ctx, w),
} satisfies DiagramPlugin<InfoModel, InfoLayout>;
