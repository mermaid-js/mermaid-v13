/**
 * What the gantt layout reads from the render context: `gantt.*` config (schema defaults from
 * the metrics table), the fonts labels are drawn in (pitfall 16), and label measuring through
 * core's label layout (D225).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  decodeEntities,
  fontSizePx,
  labelSource,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import { lengthReader } from '@mermaid-js/shared/config/readers';
import { GANTT_METRICS, type GanttMetrics } from './metrics.ts';

/** What the layout reads from the render context. */
export type GanttLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme' | 'warn'> &
  Partial<Pick<RenderContext, 'inline' | 'now' | 'availableWidth' | 'limits'>>;

/** A `gantt.*` value the layout cannot honour (pitfall 22): it uses the default instead. */
export const GANTT_CONFIG_IGNORED = 'GANTT_CONFIG_IGNORED';

export interface Env {
  readonly m: GanttMetrics;
  readonly titleTopMargin: number;
  readonly barHeight: number;
  readonly barGap: number;
  readonly topPadding: number;
  readonly rightPadding: number;
  readonly leftPadding: number;
  readonly gridLineStartPadding: number;
  readonly numberSectionStyles: number;
  /** `gantt.fontSize` in px: task labels are drawn at it. */
  readonly fontSize: number;
  readonly sectionFontSize: number;
  readonly axisFormat?: string;
  readonly tickInterval?: string;
  readonly weekday?: string;
  readonly topAxis: boolean;
  readonly compact: boolean;
  /** D272: `gantt.useWidth`, then `availableWidth`, then 1200. */
  readonly width: number;
  readonly fonts: {
    readonly task: FontKey;
    readonly section: FontKey;
    readonly tick: FontKey;
    readonly title: FontKey;
    readonly vert: FontKey;
  };
  /** A label (no wrap), in `font`, read by core's label handler; `style` bits for bold / italic. */
  label(text: string, font: FontKey, style?: number): MeasuredLabel;
  /** A section title, read as {@link Env.label} is, in the section font; `</br>` breaks too. */
  sectionLabel(text: string): MeasuredLabel;
  /** An axis label, measured as written in the tick font: the axis format is no label. */
  tickLabel(text: string): MeasuredLabel;
}

type Warn = GanttLayoutContext['warn'];

function warnIgnored(warn: Warn, path: string, fallback: unknown, why: string): void {
  warn({
    code: GANTT_CONFIG_IGNORED,
    message: `Ignored gantt.${path}: ${why}; using ${String(fallback)}`,
    path: `gantt.${path}`,
  });
}

/** A font size: a number, or a CSS size v12 wrote into `font-size` (`'14px'`, `'11'`). */
function sizeOf(value: unknown, fallback: number, base: number, path: string, warn: Warn): number {
  if (value === undefined) return fallback;
  const px = fontSizePx(value, base);
  if (px !== undefined && Number.isFinite(px) && px > 0) return px;
  warnIgnored(warn, path, fallback, 'it is not a font size');
  return fallback;
}

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

// An axis label is no label: its text comes from the axis format, so it is measured as written,
// as v12 drew it with `.text()`. Markup and `\n` are escaped before core's label layout reads
// it; entity codes are decoded first (D563). A math span (`$$…$$`, D176) an inline-box provider
// takes is passed through untouched; one none takes is shown as written too.
const RE_MATH = /(\$\$[\s\S]*?\$\$)/;
const RE_ESCAPED = /[&<]|\\(?=n)/g;
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '\\': '&#92;' };
const escaped = (part: string): string =>
  decodeEntities(part).replace(RE_ESCAPED, (c) => ESCAPES[c]!);
/** `text` shown as written, but the math spans `boxed` says a provider takes. */
const literal = (text: string, boxed: (span: string) => boolean): string =>
  text
    .split(RE_MATH)
    .map((part, i) => (i % 2 === 1 && boxed(part) ? part : escaped(part)))
    .join('');

// The title, section names and task labels (`vert` markers included) go through core's label
// handler (D735, amending D263): the common tags draw, `<br>` and a written `\n` break the line,
// a quoted markdown string (`"`…`"`) is markdown, and all else is plain text; with
// `markdownAlwaysOn` every label is markdown (the handler reads the setting). The parser keeps a
// label's quotes, so the handler finds the markdown string itself. Entity codes decode as in
// every label, and the parser's `&lt;` for a `#lt;` is text (D563).

/**
 * v12 broke a section name on `common.lineBreakRegex`, which takes `</br>` too; core's label
 * layout reads `</br>` as a closing tag. A section name keeps the v12 break.
 */
const RE_V12_CLOSE_BREAK = /<\/br\s*\/?>/gi;

export function envOf(ctx: GanttLayoutContext): Env {
  const m = GANTT_METRICS;
  const d = m.defaults;
  const conf = (ctx.config.gantt ?? {}) as Record<string, unknown>;
  const warn = ctx.warn;
  const lengthOf = lengthReader(GANTT_CONFIG_IGNORED, warn);
  const base = ctx.theme.number('fontSize');
  const family = ctx.theme.value('fontFamily');
  const fontSize = sizeOf(conf.fontSize, d.fontSize, base, 'fontSize', warn);
  const sectionFontSize = sizeOf(
    conf.sectionFontSize,
    d.sectionFontSize,
    base,
    'sectionFontSize',
    warn
  );
  const font = (size: number): FontKey => ({ family, size, weight: m.weightNormal });
  const useWidth = conf.useWidth;
  // A non-finite or non-positive `availableWidth` is no width (R-LAYOUT-3): fall back.
  const available = ctx.availableWidth;
  let width =
    available !== undefined && Number.isFinite(available) && available > 0 ? available : m.width;
  if (useWidth !== undefined) width = lengthOf(useWidth, width, 'gantt.useWidth');
  const fonts = {
    task: font(fontSize),
    section: font(sectionFontSize),
    tick: font(m.tickFontSize),
    title: font(m.titleFontSize),
    vert: font(m.vertFontSize),
  };
  // Whether an inline-box provider takes the whole span (it comes back as one placeholder).
  const boxed = (span: string, f: FontKey): boolean => {
    const out = ctx.inline?.extract(span, f, ctx.measurer);
    return out !== undefined && out.boxes.length === 1 && out.source.length === 1;
  };
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure = (text: string, f: FontKey, style = 0): MeasuredLabel => {
    const source = labelSource(text, {}, ctx.config);
    return layoutLabel(source.text, f, Infinity, ctx.measurer, { ...source, style, ...inline });
  };
  return {
    m,
    titleTopMargin: lengthOf(conf.titleTopMargin, d.titleTopMargin, 'gantt.titleTopMargin'),
    barHeight: lengthOf(conf.barHeight, d.barHeight, 'gantt.barHeight'),
    barGap: lengthOf(conf.barGap, d.barGap, 'gantt.barGap'),
    topPadding: lengthOf(conf.topPadding, d.topPadding, 'gantt.topPadding'),
    rightPadding: lengthOf(conf.rightPadding, d.rightPadding, 'gantt.rightPadding'),
    leftPadding: lengthOf(conf.leftPadding, d.leftPadding, 'gantt.leftPadding'),
    gridLineStartPadding: lengthOf(
      conf.gridLineStartPadding,
      d.gridLineStartPadding,
      'gantt.gridLineStartPadding'
    ),
    numberSectionStyles: Math.floor(
      lengthOf(conf.numberSectionStyles, d.numberSectionStyles, 'gantt.numberSectionStyles', 1)
    ),
    fontSize,
    sectionFontSize,
    ...(textOf(conf.axisFormat) !== undefined ? { axisFormat: textOf(conf.axisFormat)! } : {}),
    ...(textOf(conf.tickInterval) !== undefined
      ? { tickInterval: textOf(conf.tickInterval)! }
      : {}),
    ...(textOf(conf.weekday) !== undefined ? { weekday: textOf(conf.weekday)! } : {}),
    topAxis: conf.topAxis === true,
    compact: conf.displayMode === 'compact',
    width,
    fonts,
    label: measure,
    sectionLabel: (text) => measure(text.replace(RE_V12_CLOSE_BREAK, '<br>'), fonts.section),
    tickLabel: (text) =>
      layoutLabel(
        literal(text, (span) => boxed(span, fonts.tick)),
        fonts.tick,
        Infinity,
        ctx.measurer,
        inline
      ),
  };
}

export { Style };
