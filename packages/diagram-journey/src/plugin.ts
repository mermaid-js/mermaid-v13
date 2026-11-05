import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { journeyConfigDefaults } from './generated/config-defaults.ts';
import { journeyLabels } from './labels.ts';
import { layoutJourney, type JourneyLayout } from './layout/index.ts';
import type { JourneyModel } from './model.ts';
import { parseJourney, type JourneyParseResult } from './parser/index.ts';
import { renderJourney } from './render/index.ts';

/** v12's detector (`journeyDetector`): case-sensitive, no word boundary. */
const DETECT = /^\s*journey/;

/**
 * The user journey plugin (spec #290): `layoutKind: 'custom'` with its own `JourneyLayout`.
 * `layout` measures and places everything; `render` writes the whole `<svg>` document into
 * the writer. `parse` takes the whole source (T2 #302). The plugin is not registered yet (the
 * package's `mermaid` manifest and `gen:registry` come with T5 #327).
 */
export const journey = {
  id: 'journey',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: journeyConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): JourneyParseResult =>
    parseJourney(text, { preprocessed: ctx.preprocessed }),
  labels: journeyLabels,
  layout: (model: JourneyModel, ctx: RenderContext): JourneyLayout => layoutJourney(model, ctx),
  render: (model: JourneyModel, layout: JourneyLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderJourney(model, layout, ctx, w),
} satisfies DiagramPlugin<JourneyModel, JourneyLayout>;
