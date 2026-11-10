// The shape → text-form table (D469, D82, DESIGN §6.3): flowchart's text forms per kind, a
// local copy (D446, never an import). Every text form is a box; the table picks its corners,
// sides and side marks, and the one form core's box has no option for (the refdoc's folded
// corner) is drawn over its border (`draw.ts`). Every agentflow shape has a text form, so text
// output never warns `ASCII_SHAPE`.
import type { BoxOptions, GlyphSet } from '@mermaid-js/core/ascii';
import type { LayoutShape } from '../layout/index.ts';

/** A text form: core's box options, plus the glyph `draw.ts` puts over the border. */
export interface TextForm {
  readonly box: BoxOptions;
  /** The top-right corner's glyph: a refdoc's folded corner. */
  readonly fold?: string;
}

const diamond = (mark: string): BoxOptions['marks'] => ({
  top: mark,
  right: mark,
  bottom: mark,
  left: mark,
});

/**
 * The text form of each shape (D469): a task (and a connector, drawn as one) a rounded box, a
 * tool double sides, an input a slant (`/` at each side's middle), a decision a diamond (`◇`,
 * `*` in ascii), a refdoc a folded corner (`╲`, `\`), an action a hexagon (`<`, `>`), a
 * collapsed flow a box marked `+`.
 */
export function textForm(shape: LayoutShape, glyphs: GlyphSet): TextForm {
  const unicode = glyphs.name === 'unicode';
  switch (shape) {
    case 'rounded':
      return { box: { form: 'rounded' } };
    case 'fr-rect':
      return { box: { form: 'double-side' } };
    case 'lean-r':
      return { box: { marks: { left: '/', right: '/' } } };
    case 'diam':
      return { box: { marks: diamond(unicode ? '◇' : '*') } };
    case 'lin-doc':
      return { box: {}, fold: unicode ? '╲' : '\\' };
    case 'hex':
      return { box: { marks: { left: '<', right: '>' } } };
    case 'collapsedGroup':
      return { box: { marker: '+' } };
  }
}
