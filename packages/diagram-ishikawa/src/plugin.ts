import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { ishikawaLabels } from './labels.ts';
import { layoutIshikawa, type IshikawaLayout } from './layout/index.ts';
import type { IshikawaModel } from './model.ts';
import { detectIshikawa, parseIshikawa, type IshikawaParseResult } from './parser/index.ts';
import { renderIshikawa } from './render/index.ts';

/**
 * The ishikawa plugin (DESIGN §12.1, spec #519): `layoutKind: 'custom'` with its own
 * `IshikawaLayout` (D491). `parse` takes the whole source; `layout` measures every label and
 * places the fishbone; `render` writes the whole `<svg>` document. SVG only for now (T7 may add
 * the outline as a lazy `ascii` entry, D498). No theme table: it reads only shared variables.
 * The registry loads it from the package's `mermaid` manifest, and `configDefaults` come with
 * the generated `ishikawa` defaults (both T5).
 */
export const ishikawa = {
  id: 'ishikawa',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectIshikawa(text),
  parse: (text: string, ctx: DiagramParseContext): IshikawaParseResult =>
    parseIshikawa(text, { preprocessed: ctx.preprocessed }),
  labels: ishikawaLabels,
  layout: (model: IshikawaModel, ctx: RenderContext): IshikawaLayout => layoutIshikawa(model, ctx),
  render: (model: IshikawaModel, layout: IshikawaLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderIshikawa(model, layout, ctx, w),
} satisfies DiagramPlugin<IshikawaModel, IshikawaLayout>;
