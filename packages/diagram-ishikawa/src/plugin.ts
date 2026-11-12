import { resolveLimits } from '@mermaid-js/core/limits';
import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { ishikawaConfigDefaults } from './generated/config-defaults.ts';
import { ishikawaLabels } from './labels.ts';
import { layoutIshikawa, type IshikawaLayout } from './layout/index.ts';
import type { IshikawaModel } from './model.ts';
import { detectIshikawa, parseIshikawa, type IshikawaParseResult } from './parser/index.ts';
import { renderIshikawa } from './render/index.ts';

/**
 * The ishikawa plugin (DESIGN §12.1, spec #519): `layoutKind: 'custom'` with its own
 * `IshikawaLayout` (D491). `parse` takes the whole source; `layout` measures every label and
 * places the fishbone; `render` writes the whole `<svg>` document. Text output is the separate
 * `./ascii` entry (#586, D498), which draws the model as an outline. No theme table: it reads
 * only shared variables. The registry loads it from the package's `mermaid` manifest (#585);
 * `configDefaults` are the generated `ishikawa` section defaults, the one source of every
 * ishikawa default (`src/config.ts` falls back to them too).
 */
export const ishikawa = {
  id: 'ishikawa',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  configDefaults: ishikawaConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectIshikawa(text),
  parse: (text: string, ctx: DiagramParseContext): IshikawaParseResult => {
    const { maxNodes, maxDepth } = ctx.limits ?? resolveLimits(ctx.config);
    return parseIshikawa(text, { preprocessed: ctx.preprocessed, maxNodes, maxDepth });
  },
  labels: ishikawaLabels,
  layout: (model: IshikawaModel, ctx: RenderContext): IshikawaLayout => layoutIshikawa(model, ctx),
  render: (model: IshikawaModel, layout: IshikawaLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderIshikawa(model, layout, ctx, w),
} satisfies DiagramPlugin<IshikawaModel, IshikawaLayout>;
