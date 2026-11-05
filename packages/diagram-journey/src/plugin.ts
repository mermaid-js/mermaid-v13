import type { DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { AstNode, ParseResult } from '@mermaid-js/core/parser-kit';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { journeyLabels } from './labels.ts';
import { layoutJourney, type JourneyLayout } from './layout/index.ts';
import type { JourneyModel } from './model.ts';
import { renderJourney } from './render/index.ts';

/** v12's detector (`journeyDetector`): case-sensitive, no word boundary. */
const DETECT = /^\s*journey/;

/**
 * The user journey plugin (spec #290): `layoutKind: 'custom'` with its own `JourneyLayout`.
 * `layout` measures and places everything; `render` writes the whole `<svg>` document into
 * the writer. The parser lands with T2 #302: until then `parse` throws, so the plugin is not
 * registered (the package's `mermaid` manifest and `gen:registry` come with T5 #327).
 */
export const journey = {
  id: 'journey',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (): ParseResult<JourneyModel, AstNode> => {
    throw new Error('The journey parser is not built yet (spec #290 T2, #302)');
  },
  labels: journeyLabels,
  layout: (model: JourneyModel, ctx: RenderContext): JourneyLayout => layoutJourney(model, ctx),
  render: (model: JourneyModel, layout: JourneyLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderJourney(model, layout, ctx, w),
} satisfies DiagramPlugin<JourneyModel, JourneyLayout>;
