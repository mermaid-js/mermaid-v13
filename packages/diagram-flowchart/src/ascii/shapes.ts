// The shape → text-form table (D82, DESIGN §6.3). Every text form is a box; the table picks
// its corners, sides and side marks. Shapes not listed are drawn as plain boxes and named in
// one `ASCII_SHAPE` warning.
import type { BoxOptions, GlyphSet } from '@mermaid-js/core/ascii';

type Form = (glyphs: GlyphSet) => BoxOptions;

const square: Form = () => ({});
const rounded: Form = () => ({ form: 'rounded' });

const FORMS: ReadonlyMap<string, Form> = /* @__PURE__ */ new Map<string, Form>([
  ['rect', square],
  ['rounded', rounded],
  ['stadium', rounded],
  ['circle', rounded],
  ['ellipse', rounded],
  ['diam', (g) => ({ marks: diamond(g.name === 'unicode' ? '◇' : '*') })],
  ['hex', () => ({ marks: { left: '<', right: '>' } })],
  ['fr-rect', () => ({ form: 'double-side' })],
  ['cyl', () => ({ form: 'caps' })],
  ['collapsedGroup', () => ({ marker: '+' })],
  // Images and icons keep their label in a box; the asset is an `ASCII_DROPPED` image.
  ['img', square],
  ['icon', square],
]);

const diamond = (mark: string): BoxOptions['marks'] => ({
  top: mark,
  right: mark,
  bottom: mark,
  left: mark,
});

/** The box options a shape is drawn with, or undefined when it has no text form of its own. */
export function textForm(shape: string, glyphs: GlyphSet): BoxOptions | undefined {
  return FORMS.get(shape)?.(glyphs);
}
