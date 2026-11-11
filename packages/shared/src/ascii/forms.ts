// The shape → text-form table (D82, DESIGN §6.3) of the diagrams that draw flowchart's shapes.
// Every text form is a box; the table picks its corners, sides and side marks.
import type { BoxOptions, GlyphSet } from '@mermaid-js/core/ascii';

type Form = (glyphs: GlyphSet) => BoxOptions;

const rounded: Form = () => ({ form: 'rounded' });

/** The same mark at the middle of each side. */
export const sideMarks = (mark: string): BoxOptions['marks'] => ({
  top: mark,
  right: mark,
  bottom: mark,
  left: mark,
});

const FORMS: ReadonlyMap<string, Form> = /* @__PURE__ */ new Map<string, Form>([
  ['rect', () => ({})],
  ['rounded', rounded],
  ['stadium', rounded],
  ['circle', rounded],
  ['ellipse', rounded],
  ['diam', (g) => ({ marks: sideMarks(g.name === 'unicode' ? '◇' : '*') })],
  ['hex', () => ({ marks: { left: '<', right: '>' } })],
  ['fr-rect', () => ({ form: 'double-side' })],
  ['cyl', () => ({ form: 'caps' })],
  ['collapsedGroup', () => ({ marker: '+' })],
]);

/** The box options a shape is drawn with, or undefined when it has no text form of its own. */
export function boxForm(shape: string, glyphs: GlyphSet): BoxOptions | undefined {
  return FORMS.get(shape)?.(glyphs);
}
