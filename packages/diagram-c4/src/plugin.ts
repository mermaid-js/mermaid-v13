import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { c4ConfigDefaults } from './generated/config-defaults.ts';
import {
  boundaryTypeText,
  layoutC4,
  relationLabelText,
  relationTechnText,
  stereotypeText,
} from './layout/index.ts';
import type { C4Layout } from './layout/types.ts';
import type { C4Model } from './model.ts';
import { detectC4, parseC4, type C4ParseResult } from './parser/index.ts';
import { renderC4 } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * Every text the layout hands to core's label layout (D176), as written: each element's name,
 * type line and description, each boundary's label, `[type]` and description, each
 * relation's label (C4Dynamic's number included) and `[techn]`, and the title: the layout's
 * own text helpers, so the two cannot drift.
 */
function c4Labels(model: C4Model): string[] {
  const out: (string | undefined)[] = [];
  for (const e of model.elements) out.push(e.label, stereotypeText(e), e.descr);
  for (const b of model.boundaries) out.push(b.label, boundaryTypeText(b), b.descr);
  model.relations.forEach((r, i) => out.push(relationLabelText(model, r, i), relationTechnText(r)));
  out.push(model.title);
  return out.filter((t): t is string => t !== undefined && t.trim() !== '');
}

/**
 * The C4 plugin (DESIGN §12.1, spec #522): `layoutKind: 'custom'` with its own `C4Layout`.
 * `parse` takes the whole source; `layout` measures everything, places the grid and routes the
 * relations (#540); `render` writes the whole `<svg>` document (#541); `theme` is the diagram's
 * own table (`theme/table.ts`, D456). The registry loads it from the package's `mermaid`
 * manifest (#542); `configDefaults` are the `c4` section's generated defaults (`gen:config`).
 * Text output is the lazily loaded `./ascii` entry (#545); in a text render the layout runs on
 * the cell profile (`layout/cells.ts`).
 */
export const c4 = {
  id: 'c4',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  theme,
  configDefaults: c4ConfigDefaults as Readonly<Record<string, unknown>>,
  // D451: one of the five headers, word-bounded, where the diagram starts.
  detector: (text: string): boolean => detectC4(text),
  parse: (text: string, ctx: DiagramParseContext): C4ParseResult => {
    const { maxNodes, maxEdges, maxDepth } = ctx.limits ?? resolveLimits(ctx.config);
    return parseC4(text, { preprocessed: ctx.preprocessed, maxNodes, maxEdges, maxDepth });
  },
  labels: c4Labels,
  layout: (model: C4Model, ctx: RenderContext): C4Layout => layoutC4(model, ctx),
  render: (model: C4Model, layout: C4Layout, ctx: RenderContext, w: SvgWriter): void =>
    renderC4(model, layout, ctx, w),
} satisfies DiagramPlugin<C4Model, C4Layout>;
