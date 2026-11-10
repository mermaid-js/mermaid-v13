import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { eventmodelingConfigDefaults } from './generated/config-defaults.ts';
import { layoutEventModel, type EventModelLayout } from './layout/index.ts';
import type { EventModel } from './model.ts';
import {
  detectEventModeling,
  parseEventModel,
  type EventModelParseResult,
} from './parser/index.ts';
import { renderEventModel } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The event modeling plugin (DESIGN §12.1, spec #527): `layoutKind: 'custom'` with its own
 * `EventModelLayout`. `parse` takes the whole source; `layout` sizes and places lanes, boxes and
 * relations; `render` writes the whole `<svg>` document. SVG only (D320).
 *
 * `theme` is event modeling's own table (`theme/table.ts`, D331, D527). `labels` gives no
 * strings: box text is plain (D523), laid out as written and never through `ctx.inline`, so a
 * `$$` in data loads no math engine (D176, D178). It is registered from the package's `mermaid`
 * manifest (#611); `configDefaults` are the `eventmodeling` section's generated defaults.
 */
export const eventmodeling = {
  id: 'eventmodeling',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: eventmodelingConfigDefaults as Readonly<Record<string, unknown>>,
  labels: (): readonly string[] => [],
  detector: (text: string): boolean => detectEventModeling(text),
  parse: (text: string, ctx: DiagramParseContext): EventModelParseResult =>
    parseEventModel(text, { preprocessed: ctx.preprocessed }),
  layout: (model: EventModel, ctx: RenderContext): EventModelLayout => layoutEventModel(model, ctx),
  render: (model: EventModel, layout: EventModelLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderEventModel(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<EventModel, EventModelLayout>;
