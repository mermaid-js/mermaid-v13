// The colours and the opacity the pie renderer draws with (spec #288 §Renderer, D215, D227).
// Every one is a pie theme variable once #325 adds it to the vocabulary; until then a name the
// vocabulary does not know takes the stand-in below, which #325 deletes. Each name is written
// as a literal, so the vocabulary `usedBy` scan (`theme-used-by.spec.ts`) sees it once it is
// added. Pie has no theme-name or `look` branch, no gradient and no shadow (D227).
import type { RenderContext } from '@mermaid-js/core';
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import { THEME_VARIABLES } from '@mermaid-js/core/theme';
import { PIE_COLOURS } from '../layout/metrics.ts';

type Theme = RenderContext['theme'];

/** A pie colour variable and what it is while the vocabulary does not know it. */
interface Themed {
  readonly name: string;
  /** A literal (v12 `default`'s computed value), or `undefined` for the shared `textColor`. */
  readonly literal?: string;
}
const literal = (name: string, value: string): Themed => ({ name, literal: value });
const text = (name: string): Themed => ({ name });

/**
 * Stand-ins for #325 (GAPS.md): `pie1`…`pie12` as v12's `default` theme computes them, strokes
 * black as every v12 theme sets them, and the texts in the shared `textColor` (v12's section
 * text is `textColor`; its title and legend take `taskTextDarkColor` or `mainContrastColor`,
 * which the vocabulary lacks).
 */
export const PIE_COLOUR_STAND_INS: readonly Themed[] = [
  literal('pie1', '#ECECFF'),
  literal('pie2', '#ffffde'),
  literal('pie3', 'hsl(80, 100%, 56.2745098039%)'),
  literal('pie4', 'hsl(240, 100%, 86.2745098039%)'),
  literal('pie5', 'hsl(60, 100%, 63.5294117647%)'),
  literal('pie6', 'hsl(80, 100%, 76.2745098039%)'),
  literal('pie7', 'hsl(300, 100%, 76.2745098039%)'),
  literal('pie8', 'hsl(180, 100%, 56.2745098039%)'),
  literal('pie9', 'hsl(0, 100%, 56.2745098039%)'),
  literal('pie10', 'hsl(300, 100%, 56.2745098039%)'),
  literal('pie11', 'hsl(150, 100%, 56.2745098039%)'),
  literal('pie12', 'hsl(0, 100%, 66.2745098039%)'),
  literal('pieStrokeColor', 'black'),
  literal('pieOuterStrokeColor', 'black'),
  text('pieTitleTextColor'),
  text('pieSectionTextColor'),
  text('pieLegendTextColor'),
];

/** v12's `pieOpacity` in every theme, until #325 adds the variable (kind `opacity`, D221). */
export const PIE_OPACITY_STAND_IN = 0.7;

const BY_NAME = new Map(PIE_COLOUR_STAND_INS.map((t) => [t.name, t]));

const known = (name: string): boolean => Object.hasOwn(THEME_VARIABLES, name);

/** The theme's colour when its vocabulary has the variable, else the stand-in. */
function colour(theme: Theme, name: string): Paint {
  if (known(name)) return theme.color(name);
  const lit = BY_NAME.get(name)!.literal;
  return lit === undefined ? theme.color('textColor') : (checkColor(lit) as Paint);
}

/** `pieOpacity`: the theme's number in [0, 1] once the vocabulary has it, else v12's 0.7. */
function opacity(theme: Theme): number {
  if (!known('pieOpacity')) return PIE_OPACITY_STAND_IN;
  const v = theme.number('pieOpacity');
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : PIE_OPACITY_STAND_IN;
}

export interface Paints {
  /** `pie${slot + 1}`: a slice and its legend swatch. */
  readonly slot: (colour: number) => Paint;
  readonly stroke: Paint;
  readonly outerStroke: Paint;
  readonly opacity: number;
  readonly title: Paint;
  readonly section: Paint;
  readonly legend: Paint;
}

/**
 * Every paint the chart uses, read before the root is written so that it declares their
 * aliases: the slots `slots` lists (each drawn slice and legend row), and the title's colour
 * only when there is a title.
 */
export function paints(theme: Theme, slots: Iterable<number>, title: boolean): Paints {
  const fills = new Map<number, Paint>();
  for (const s of slots)
    if (!fills.has(s)) fills.set(s, colour(theme, PIE_COLOUR_STAND_INS[s % PIE_COLOURS]!.name));
  return {
    slot: (c) => fills.get(c)!,
    stroke: colour(theme, 'pieStrokeColor'),
    outerStroke: colour(theme, 'pieOuterStrokeColor'),
    opacity: opacity(theme),
    title: title ? colour(theme, 'pieTitleTextColor') : ('currentColor' as Paint),
    section: colour(theme, 'pieSectionTextColor'),
    legend: colour(theme, 'pieLegendTextColor'),
  };
}
