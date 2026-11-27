import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { AstNode, ParseResult } from '@mermaid-js/core/parser-kit';
import { detectC4Beta } from './beta/detect.ts';
import { layoutC4Beta } from './beta/layout.ts';
import { isC4Beta, type C4BetaModel } from './beta/model.ts';
import { parseC4Beta } from './beta/parser.ts';
import { renderC4Beta } from './beta/render.ts';
import { edgeLabelText, stereotypeOf } from './beta/prepare.ts';
import { c4ConfigDefaults } from './generated/config-defaults.ts';
import {
  boundaryTypeText,
  descrText,
  labelText,
  layoutC4,
  relationLabelText,
  relationTechnText,
  stereotypeText,
} from './layout/index.ts';
import { fieldText, type C4Text } from './label-text.ts';
import type { C4Layout } from './layout/types.ts';
import type { C4Model } from './model.ts';
import { detectC4, parseC4 } from './parser/index.ts';
import { renderC4 } from './render/index.ts';
import { theme } from './theme/table.ts';

/** What the one `c4` plugin parses: a legacy C4 model, or a c4-beta one (spec #730). */
export type C4AnyModel = C4Model | C4BetaModel;

/**
 * Every text the layout hands to core's label layout (D176), as written: each element's name,
 * type line and description, each boundary's label, `[type]` and description, each
 * relation's label (C4Dynamic's number included) and `[techn]`, and the title: the layout's
 * own text helpers, so the two cannot drift.
 */
function c4Labels(model: C4Model): string[] {
  const out: (C4Text | string | undefined)[] = [];
  for (const e of model.elements) out.push(labelText(e), stereotypeText(e), descrText(e));
  for (const b of model.boundaries) out.push(labelText(b), boundaryTypeText(b), descrText(b));
  model.relations.forEach((r, i) => out.push(relationLabelText(model, r, i), relationTechnText(r)));
  out.push(model.title);
  return texts(out);
}

/**
 * c4-beta's texts as drawn: names, type lines (technology and instances), descriptions, relation
 * labels and technologies, and the title.
 */
function c4BetaLabels(model: C4BetaModel): string[] {
  const out: (C4Text | string | undefined)[] = [];
  for (const e of model.elements) {
    out.push(fieldText(e, 'name', e.name), fieldText(e, 'description', e.description));
    out.push(stereotypeOf(e), fieldText(e, 'instances', e.instances));
  }
  for (const r of model.relations) {
    out.push(edgeLabelText(r), fieldText(r, 'technology', r.technology));
  }
  out.push(model.title);
  return texts(out);
}

/** The texts that are not empty. */
const texts = (all: readonly (C4Text | string | undefined)[]): string[] =>
  all
    .map((t) => (typeof t === 'string' ? t : t?.text))
    .filter((t): t is string => t !== undefined && t.trim() !== '');

/**
 * The C4 plugin (DESIGN §12.1, spec #522): `layoutKind: 'custom'` with its own `C4Layout`.
 * `parse` takes the whole source; `layout` measures everything, places the grid and routes the
 * relations (#540); `render` writes the whole `<svg>` document (#541); `theme` is the diagram's
 * own table (`theme/table.ts`, D456). The registry loads it from the package's `mermaid`
 * manifest (#542); `configDefaults` are the `c4` section's generated defaults (`gen:config`).
 * Text output is the lazily loaded `./ascii` entry (#545); in a text render the layout runs on
 * the cell profile (`layout/cells.ts`).
 *
 * It is also the plugin of `c4-beta` (spec #730, `aliases`): `parse` routes on the header, and
 * `layout` and `render` on the model it made. c4-beta lays out with core's `layered` engine
 * (`beta/layout.ts`) and draws with the painters above; its text output is the same `./ascii` entry,
 * on the cell profile and the engine's grid mode (`beta/cells.ts`).
 */
export const c4 = {
  id: 'c4',
  aliases: ['c4beta'] as readonly string[],
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  theme,
  configDefaults: c4ConfigDefaults as Readonly<Record<string, unknown>>,
  // D451: one of the five headers, word-bounded, where the diagram starts; or `c4-beta`.
  detector: (text: string): boolean => detectC4(text) || detectC4Beta(text),
  parse: (text: string, ctx: DiagramParseContext): ParseResult<C4AnyModel, AstNode> => {
    const { maxNodes, maxEdges, maxDepth } = ctx.limits ?? resolveLimits(ctx.config);
    const options = { preprocessed: ctx.preprocessed, maxNodes, maxEdges, maxDepth };
    return detectC4Beta(text, ctx.preprocessed)
      ? parseC4Beta(text, options)
      : parseC4(text, options);
  },
  labels: (model: C4AnyModel): string[] =>
    isC4Beta(model) ? c4BetaLabels(model) : c4Labels(model),
  layout: (model: C4AnyModel, ctx: RenderContext): C4Layout => {
    return isC4Beta(model) ? layoutC4Beta(model, ctx) : layoutC4(model, ctx);
  },
  render: (model: C4AnyModel, layout: C4Layout, ctx: RenderContext, w: SvgWriter): void =>
    isC4Beta(model) ? renderC4Beta(model, layout, ctx, w) : renderC4(model, layout, ctx, w),
} satisfies DiagramPlugin<C4AnyModel, C4Layout>;
