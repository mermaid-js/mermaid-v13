/**
 * The ishikawa diagram's text output (#586, D498, D320), a separate lazily loaded entry
 * (`@mermaid-js/diagram-ishikawa/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws from `IshikawaModel`, not from the layout: the outline is the model's tree, and the
 * fishbone's geometry has no text form (D498). Each label goes through core's label layout in
 * cells and is written as plain text, as the SVG's `<title>` is (T4): entities decoded, markup
 * gone, a `<br>` a space. Bold and italic are dropped with one `ASCII_DROPPED` warning (D82).
 */
import type { TextRenderContext, Warning } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, cellMeasurer, unicode } from '@mermaid-js/core/ascii';
import { layoutLabel, Style, type LabelOptions, type MeasuredLabel } from '@mermaid-js/core/text';
import type { IshikawaCause, IshikawaModel } from './model.ts';
import { drawOutline } from './ascii/outline.ts';

/** What the hook reads of core's `TextRenderContext`. */
export type IshikawaAsciiContext = Pick<TextRenderContext, 'config' | 'warn'> &
  Partial<Pick<TextRenderContext, 'inline'>>;

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends Warning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: 'emphasis';
  readonly astIds: readonly string[];
}

/** The cell measurer ignores the font: one key for every label. */
const FONT = { family: '', size: 1, weight: 400 } as const;

const emphasised = (label: MeasuredLabel): boolean =>
  label.lines.some((line) => line.some((r) => (r.style & (Style.Bold | Style.Italic)) !== 0));

/**
 * The ishikawa `ascii` hook (DESIGN §12.1): the outline as text, `\n` line ends, no trailing
 * spaces, never cropped (the API adds `ASCII_TOO_WIDE`, R-ASCII-8). The layout is not read. An
 * empty body (no effect) is the empty string, as the SVG draws nothing.
 */
export function ascii(model: IshikawaModel, _layout: unknown, ctx: IshikawaAsciiContext): string {
  const { effect } = model;
  if (!effect) return '';
  const glyphs = asciiOptions(ctx.config).charset === 'ascii' ? asciiGlyphs : unicode;
  const options: LabelOptions = ctx.inline ? { inline: ctx.inline } : {};
  const dropped: string[] = [];
  const plain = (text: string, ast: string): string => {
    const label = layoutLabel(text, FONT, Infinity, cellMeasurer, options);
    if (emphasised(label)) dropped.push(ast);
    return label.lines
      .map((runs) => {
        const line = runs.map((r) => r.text).join('');
        // A list item's own marker: a bullet written in the text stays as written.
        return glyphs.name === 'ascii' && label.left ? line.replace(/^(\s*)[•◦]/, '$1-') : line;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const head = plain(effect.text, effect.ast);
  const text = drawOutline(
    head,
    model.causes,
    (c: IshikawaCause) => plain(c.text, c.ast),
    glyphs,
    model.title
  );
  if (dropped.length > 0)
    ctx.warn({
      code: 'ASCII_DROPPED',
      feature: 'emphasis',
      astIds: dropped,
      message: 'Text output has no bold and italic text; dropped.',
    } satisfies AsciiDroppedWarning);
  return text;
}
