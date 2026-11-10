import { eachCause, type IshikawaModel } from './model.ts';

/**
 * Every text the ishikawa layout hands to core's label layout (D176, D178), as written: the
 * effect, then every cause and sub-cause in source order (pre-order).
 */
export function ishikawaLabels(model: IshikawaModel): readonly string[] {
  const out: string[] = [];
  if (model.effect) out.push(model.effect.text);
  eachCause(model.causes, (c) => out.push(c.text));
  return out;
}

/** A laid-out label's lines, each a list of runs (core's label layout, in px or in cells). */
type LabelLines = readonly (readonly { readonly text: string }[])[];

/**
 * A laid-out label as one line of plain text, as the SVG's `<title>` and the text output write
 * it: its lines as laid out (entities decoded, markup gone), joined by a space, so a `<br>` or
 * a wrap reads as one, blanks collapsed. `line` rewrites each line first (the text output's
 * ASCII bullets).
 */
export function plainLabel(lines: LabelLines, line: (text: string) => string = (t) => t): string {
  return lines
    .map((runs) => line(runs.map((r) => r.text).join('')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The front-matter `title` as one line, as the SVG's `<title>` and the text output's first line
 * write it: blanks collapsed and trimmed; `undefined` when it has no text.
 */
export function plainTitle(title: string | undefined): string | undefined {
  return title?.replace(/\s+/g, ' ').trim() || undefined;
}
