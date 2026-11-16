// The shape → text-form table (D82, DESIGN §6.3): the shared forms (`@mermaid-js/shared/ascii`),
// and a plain box for an image or an icon. Shapes without a form are drawn as plain boxes and
// named in one `ASCII_SHAPE` warning.
import type { BoxOptions, GlyphSet } from '@mermaid-js/core/ascii';
import { boxForm } from '@mermaid-js/shared/ascii';

/** The box options a shape is drawn with, or undefined when it has no text form of its own. */
export function textForm(shape: string, glyphs: GlyphSet): BoxOptions | undefined {
  // Images and icons keep their label in a box; the asset is an `ASCII_DROPPED` image.
  return shape === 'img' || shape === 'icon' ? {} : boxForm(shape, glyphs);
}
