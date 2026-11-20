/**
 * The ishikawa diagram's text output (#586, D498, D320), a separate lazily loaded entry
 * (`@mermaid-js/diagram-ishikawa/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws from `IshikawaModel`, not from the layout: the outline is the model's tree, and the
 * fishbone's geometry has no text form (D498). Each label goes through core's label layout in
 * cells and is written as plain text, as the SVG's `<title>` is (`labels.ts`): entities decoded,
 * markup gone, a `<br>` a space. Bold and italic are dropped with one `ASCII_DROPPED` warning
 * (D82); math and icons are shown as written, with core's own `ASCII_DROPPED` warnings.
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { layoutLabel, type LabelOptions } from '@mermaid-js/core/text';
import { drawOutline } from './ascii/outline.ts';
import { plainLabel, plainTitle } from './labels.ts';
import type { IshikawaCause, IshikawaModel } from './model.ts';
import { asciiDropped, emphasised, glyphSetOf } from '@mermaid-js/shared/ascii';

/** What the hook reads of core's `TextRenderContext`. */
export type IshikawaAsciiContext = Pick<TextRenderContext, 'config' | 'warn'> &
  Partial<Pick<TextRenderContext, 'inline'>>;

/** The cell measurer ignores the font: one key for every label. */
const FONT = { family: '', size: 1, weight: 400 } as const;

/**
 * The ishikawa `ascii` hook (DESIGN §12.1): the outline as text, `\n` line ends, no trailing
 * spaces, never cropped (the API adds `ASCII_TOO_WIDE`, R-ASCII-8). The layout is not read. An
 * empty body (no effect) is its front-matter title alone, or the empty string with no title, as
 * the SVG draws nothing.
 */
export function ascii(model: IshikawaModel, _layout: unknown, ctx: IshikawaAsciiContext): string {
  const { effect } = model;
  const title = plainTitle(model.title);
  if (!effect) return title ?? '';
  const glyphs = glyphSetOf(ctx.config);
  const options: LabelOptions = ctx.inline ? { inline: ctx.inline } : {};
  const dropped: string[] = [];
  const plain = (text: string, ast: string): string => {
    const label = layoutLabel(text, FONT, Infinity, cellMeasurer, options);
    if (emphasised(label)) dropped.push(ast);
    // A list item's own marker: a bullet written in the text stays as written.
    return glyphs.name === 'ascii' && label.left
      ? plainLabel(label.lines, (line) => line.replace(/^(\s*)[•◦]/, '$1-'))
      : plainLabel(label.lines);
  };
  const head = plain(effect.text, effect.ast);
  const text = drawOutline(
    head,
    model.causes,
    (c: IshikawaCause) => plain(c.text, c.ast),
    glyphs,
    title
  );
  if (dropped.length > 0) ctx.warn(asciiDropped('emphasis', dropped, 'bold and italic text'));
  return text;
}
