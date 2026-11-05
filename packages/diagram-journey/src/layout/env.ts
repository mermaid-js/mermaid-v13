/**
 * What every step of the journey layout shares: the metrics, the fonts and a label measurer.
 */
import type { RenderContext } from '@mermaid-js/core';
import { checkStyle } from '@mermaid-js/core/svg';
import { fontSizePx, layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { FONT_WEIGHT, journeyMetrics, TITLE_FONT, type JourneyMetrics } from './metrics.ts';

/** What the layout reads from the render context. */
export type JourneyLayoutContext = Pick<
  RenderContext,
  'config' | 'measurer' | 'theme' | 'warn' | 'inline'
>;

export interface Fonts {
  /** Task and section names (v12 draws both in `taskFontSize`/`taskFontFamily`). */
  readonly task: FontKey;
  /** Legend labels: the theme font (v12 `.legend`). */
  readonly legend: FontKey;
  readonly title: FontKey;
}

export interface Env {
  readonly m: JourneyMetrics;
  readonly fonts: Fonts;
  readonly warn: JourneyLayoutContext['warn'];
  /** Lays out a label wrapped at `max` (`Infinity` breaks at explicit breaks only). */
  measure(text: string, font: FontKey, max: number): MeasuredLabel;
}

/**
 * The fonts labels are measured in, and so drawn in (the renderer reads them too). Family keys
 * inherit the Mermaid font (D132); a family the style check refuses falls back to it, with a
 * warning when `warn` is given. An unset `taskFontSize` is the theme size; `titleFontSize`
 * defaults to `4ex` of it (D248).
 */
export function fontsOf(
  ctx: Pick<JourneyLayoutContext, 'config' | 'theme'>,
  warn?: JourneyLayoutContext['warn']
): Fonts {
  const cfg = (ctx.config.journey ?? {}) as Readonly<Record<string, unknown>>;
  const family = ctx.theme.value('fontFamily');
  const size = ctx.theme.number('fontSize');
  const familyOf = (key: string): string => {
    const f = cfg[key];
    if (typeof f !== 'string' || f.trim() === '') return family;
    const safe = checkStyle(['font-family:' + f]).text['font-family'] as string | undefined;
    if (safe === undefined)
      warn?.({
        code: 'STYLE_VALUE_DROPPED',
        message: `Dropped journey.${key} ${JSON.stringify(f)}: it is not a font family Mermaid allows`,
        path: `journey.${key}`,
      });
    return safe ?? family;
  };
  const sizeOf = (key: string, fallback: number): number => {
    const s = fontSizePx(cfg[key], size);
    return s !== undefined && s > 0 ? s : fallback;
  };
  return {
    task: {
      family: familyOf('taskFontFamily'),
      size: sizeOf('taskFontSize', size),
      weight: FONT_WEIGHT.normal,
    },
    legend: { family, size, weight: FONT_WEIGHT.normal },
    title: {
      family: familyOf('titleFontFamily'),
      size: sizeOf('titleFontSize', fontSizePx(TITLE_FONT.size, size) ?? size),
      weight: TITLE_FONT.weight,
    },
  };
}

export function envOf(ctx: JourneyLayoutContext): Env {
  return {
    m: journeyMetrics(ctx.config.journey ?? {}),
    fonts: fontsOf(ctx, (w) => ctx.warn(w)),
    warn: (w) => ctx.warn(w),
    measure: (text, font, max) =>
      layoutLabel(text, font, max > 0 ? max : 1, ctx.measurer, { inline: ctx.inline }),
  };
}
