import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutC4, stereotypeText } from './layout/index.ts';
import type { C4Layout } from './layout/types.ts';
import type { C4Model } from './model.ts';
import { parseC4, type C4ParseResult } from './parser/index.ts';
import { renderC4 } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * D451's detector: one of the five headers, word-bounded, on the text the pipeline hands
 * `detector` (front matter, directives and `%%` comments already removed). `detectC4` is the
 * same test on a raw source.
 */
const DETECT = /^\s*C4(?:Context|Container|Component|Dynamic|Deployment)\b/;

/**
 * Every text the layout hands to core's label layout (D176), as written: each element's name,
 * type line and description, each boundary's label, `[type]` and description, each drawn
 * relation's label (C4Dynamic's number included) and `[techn]`, and the title.
 */
function c4Labels(model: C4Model): string[] {
  const out: string[] = [];
  for (const e of model.elements) {
    out.push(e.label, stereotypeText(e));
    if (e.descr) out.push(e.descr);
  }
  for (const b of model.boundaries) {
    out.push(b.label);
    if (b.type) out.push(`[${b.type}]`);
    if (b.descr) out.push(b.descr);
  }
  model.relations.forEach((r, i) => {
    out.push((model.c4Type === 'C4Dynamic' ? `${i + 1}: ` : '') + r.label);
    if (r.techn) out.push(`[${r.techn}]`);
  });
  if (model.title) out.push(model.title);
  return out.filter((t) => t.trim() !== '');
}

/**
 * The C4 plugin (DESIGN §12.1, spec #522): `layoutKind: 'custom'` with its own `C4Layout`.
 * `parse` takes the whole source; `layout` measures everything, places the grid and routes the
 * relations (#540); `render` writes the whole `<svg>` document (#541); `theme` is the diagram's
 * own table (`theme/table.ts`, D456). The manifest, `configDefaults` and the registry row are
 * T5's (#542).
 */
export const c4 = {
  id: 'c4',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  theme,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): C4ParseResult =>
    parseC4(text, { preprocessed: ctx.preprocessed }),
  labels: c4Labels,
  layout: (model: C4Model, ctx: RenderContext): C4Layout => layoutC4(model, ctx),
  render: (model: C4Model, layout: C4Layout, ctx: RenderContext, w: SvgWriter): void =>
    renderC4(model, layout, ctx, w),
} satisfies DiagramPlugin<C4Model, C4Layout>;
