// The shape → text-form table (D469, D82, DESIGN §6.3): the shared text forms
// (`@mermaid-js/shared/ascii`) per kind, and agentflow's own for an input and a refdoc. Every
// text form is a box; the table picks its corners, sides and side marks, and the one form
// core's box has no option for (the refdoc's folded corner) is drawn over its border
// (`draw.ts`). Every agentflow shape has a text form, so text output never warns `ASCII_SHAPE`.
import type { BoxOptions, GlyphSet } from '@mermaid-js/core/ascii';
import { boxForm } from '@mermaid-js/shared/ascii';
import type { LayoutShape } from '../layout/index.ts';

/** A text form: core's box options, plus the glyph `draw.ts` puts over the border. */
export interface TextForm {
  readonly box: BoxOptions;
  /** The top-right corner's glyph: a refdoc's folded corner. */
  readonly fold?: string;
}

/**
 * The text form of each shape (D469): a task (and a connector, drawn as one) a rounded box, a
 * tool double sides, an input a slant (`/` at each side's middle), a decision a diamond (`◇`,
 * `*` in ascii), a refdoc a folded corner (`╲`, `\`), an action a hexagon (`<`, `>`), a
 * collapsed flow a box marked `+`.
 */
export function textForm(shape: LayoutShape, glyphs: GlyphSet): TextForm {
  if (shape === 'lean-r') return { box: { marks: { left: '/', right: '/' } } };
  if (shape === 'lin-doc') return { box: {}, fold: glyphs.name === 'unicode' ? '╲' : '\\' };
  return { box: boxForm(shape, glyphs) ?? {} };
}
