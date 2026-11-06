/**
 * What the gantt layout reads from the render context: `gantt.*` config (schema defaults from
 * the metrics table), the fonts labels are drawn in (pitfall 16), and label measuring through
 * core's label layout (D225).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
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
  /** A label as written (no wrap), in `font`; `style` bits for bold / italic. */
  label(text: string, font: FontKey, style?: number): MeasuredLabel;
  /** A section title: its `<br>`s break lines (v12 `lineBreakRegex`). */
  sectionLabel(text: string): MeasuredLabel;
}

type Warn = GanttLayoutContext['warn'];

function warnIgnored(warn: Warn, path: string, fallback: unknown, why: string): void {
  warn({
    code: GANTT_CONFIG_IGNORED,
    message: `Ignored gantt.${path}: ${why}; using ${String(fallback)}`,
    path: `gantt.${path}`,
  });
}

/** A config length: a finite number at least `min`, else the default (with a warning when set). */
function lengthOf(value: unknown, fallback: number, path: string, warn: Warn, min = 0): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= min) return value;
  if (value !== undefined)
    warnIgnored(warn, path, fallback, `it is not a number of at least ${min}`);
  return fallback;
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

// Task labels are plain text, as v12 drew them with `.text()`: markup, character references and
// `\n` are shown as written, so they are escaped before core's label layout reads them. A math
// span (`$$…$$`, D176) an inline-box provider takes is passed through untouched; one none takes
// is shown as written too. Icons (D292) contain none of the escaped characters.
const RE_MATH = /(\$\$[\s\S]*?\$\$)/;
const RE_ESCAPED = /[&<]|\\(?=n)/g;
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '\\': '&#92;' };
const escaped = (part: string): string => part.replace(RE_ESCAPED, (c) => ESCAPES[c]!);
/** `text` shown as written, but the math spans `boxed` says a provider takes. */
export const literal = (text: string, boxed: (span: string) => boolean = () => false): string =>
  text
    .split(RE_MATH)
    .map((part, i) => (i % 2 === 1 && boxed(part) ? part : escaped(part)))
    .join('');

/** v12 `common.lineBreakRegex`: `<br>`, `<br/>`, `</br>`, any case. */
const RE_V12_BREAK = /<\/?br\s*\/?>/gi;

export function envOf(ctx: GanttLayoutContext): Env {
  const m = GANTT_METRICS;
  const d = m.defaults;
  const conf = (ctx.config.gantt ?? {}) as Record<string, unknown>;
  const warn = ctx.warn;
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
  if (useWidth !== undefined) width = lengthOf(useWidth, width, 'useWidth', warn);
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
  const measure = (raw: string, f: FontKey, style = 0): MeasuredLabel =>
    layoutLabel(raw, f, Infinity, ctx.measurer, {
      style,
      ...(ctx.inline ? { inline: ctx.inline } : {}),
    });
  return {
    m,
    titleTopMargin: lengthOf(conf.titleTopMargin, d.titleTopMargin, 'titleTopMargin', warn),
    barHeight: lengthOf(conf.barHeight, d.barHeight, 'barHeight', warn),
    barGap: lengthOf(conf.barGap, d.barGap, 'barGap', warn),
    topPadding: lengthOf(conf.topPadding, d.topPadding, 'topPadding', warn),
    rightPadding: lengthOf(conf.rightPadding, d.rightPadding, 'rightPadding', warn),
    leftPadding: lengthOf(conf.leftPadding, d.leftPadding, 'leftPadding', warn),
    gridLineStartPadding: lengthOf(
      conf.gridLineStartPadding,
      d.gridLineStartPadding,
      'gridLineStartPadding',
      warn
    ),
    numberSectionStyles: Math.floor(
      lengthOf(conf.numberSectionStyles, d.numberSectionStyles, 'numberSectionStyles', warn, 1)
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
    label: (text, f, style = 0) =>
      measure(
        literal(text, (span) => boxed(span, f)),
        f,
        style
      ),
    sectionLabel: (text) =>
      measure(
        text
          .split(RE_V12_BREAK)
          .map((part) => literal(part, (span) => boxed(span, fonts.section)))
          .join('<br>'),
        fonts.section
      ),
  };
}

export { Style };
