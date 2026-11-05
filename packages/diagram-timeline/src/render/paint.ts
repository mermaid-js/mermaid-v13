/**
 * The theme variables the timeline renderer reads (D152, spec #291 "v12 family differences").
 * No theme name and no `look` (D153): every family difference is a variable. Boxes take the
 * `cScale` palettes or the `mainBkg` / `nodeBorder` paint by `timelineScaleColors`; the top
 * corner, the label offsets, the line widths and the shadow by their own variables. The neo
 * themes carry the classic values (D227) and turn the gradient on: boxes then take `mainBkg`
 * with gradient outlines, and the rule under each box, a line of zero height that a gradient
 * can't paint, is drawn plain (D182, D185).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  checkColor,
  type Attrs,
  type OutlinePaint,
  type Paint,
  type SafeValue,
} from '@mermaid-js/core/svg';
import { boxStrokes, scaleColors } from '../layout/env.ts';

type Theme = RenderContext['theme'];
type Length = ReturnType<Theme['length']>;
type Shadow = ReturnType<Theme['filter']>;
type Rgba = NonNullable<ReturnType<Theme['rgba']>>;
type PaletteName = Parameters<Theme['palette']>[0];

/**
 * v12's colour classes per palette (`THEME_COLOR_LIMIT`, core's `PALETTE_LIMIT`, D258). Kept
 * here and colours read through the `Theme` object: a value import of `@mermaid-js/core/theme`
 * splits core's theme modules out of the entry chunk and grows the core closure (D161).
 */
export const PALETTE_SLOTS = 12;

/** v12 `.eventWrapper { filter: brightness(120%) }`, computed into the colours. */
const EVENT_BRIGHTNESS = 1.2;
/** v12 `svgDraw.js`: an event's label starts half its padding below the top, plus a shift. */
const EVENT_OFFSET_SHARE = 0.5;
const NORMAL_WEIGHT = 400;

/** How one box is painted. */
export interface BoxPaint {
  readonly fill: OutlinePaint;
  /** Undefined: no outline (v12 classic). */
  readonly stroke?: OutlinePaint;
  readonly strokeWidth?: Length;
  readonly text: Paint;
  /** The line under the box (v12 classic `node-line-<n>`); undefined where none is drawn. */
  readonly rule?: { readonly stroke: Paint; readonly width: number };
  /** The border palette slot (`data-color-id`), where the theme carries one. */
  readonly colorId?: `color-${number}`;
}

export interface Paints {
  /** Sections and periods in `slot`. */
  box(slot: number): BoxPaint;
  /** Events in `slot`: the box paint at v12's 120% brightness. */
  event(slot: number): BoxPaint;
  /** The axis and the connectors. */
  readonly line: Paint;
  /** `textColor`; read only when there is a title, so the root declares no unused alias. */
  readonly title: Paint;
  /** `timelineRadius`: geometry, a literal number (D152). */
  readonly radius: number;
  /** Where a label starts below its box's top. */
  labelOffset(padding: number): number;
  eventLabelOffset(padding: number): number;
  /** The theme's shadow on box outlines (v12 redux); undefined when none is drawn. */
  readonly shadow?: Shadow;
  /** Label attributes besides the fill: the weight the layout measured them at. */
  readonly label: Attrs;
}

const byte = (n: number): string =>
  Math.round(Math.min(Math.max(n, 0), 255))
    .toString(16)
    .padStart(2, '0');

/**
 * `rgba` at 120% brightness, as CSS `brightness()` computes it in sRGB, written as six or eight
 * hex digits; `c` when JS can't compute the colour. The channels are first rounded as the
 * colour's hex form holds them.
 */
function brighter(c: Paint, rgba: Rgba | undefined): Paint {
  if (!rgba) return c;
  const up = (v: number): string =>
    byte(Math.round(Math.min(Math.max(v, 0), 255)) * EVENT_BRIGHTNESS);
  const alpha = rgba[3] >= 1 ? '' : byte(rgba[3] * 255);
  const hex = '#' + up(rgba[0]) + up(rgba[1]) + up(rgba[2]) + (alpha === 'ff' ? '' : alpha);
  return checkColor(hex) ?? c;
}

function weightOf(value: string): number {
  if (value === 'bold' || value === 'bolder') return 700;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : NORMAL_WEIGHT;
}

export function paints(ctx: Pick<RenderContext, 'theme'>, titled: boolean): Paints {
  const { theme } = ctx;
  // Under `theme: 'auto'` a colour switches with the page, so events keep the theme's
  // variable rather than a computed light colour.
  const live = theme.autoDeclarations() !== undefined;
  // Every variable is read here, before the root is written, so its style declares them.
  const refs = new Map<string, Paint>();
  const named = (name: string, bright: boolean): Paint => {
    let ref = refs.get(name);
    if (ref === undefined) refs.set(name, (ref = theme.color(name)));
    if (!bright || live) return ref;
    return brighter(ref, theme.rgba(name));
  };
  // A palette entry is literal, from the light theme under `auto` (D151). Text, outlines and
  // rules drawn on it come from that same resolver, so the pair never flips separately; on a
  // live fill they stay live.
  const on = (literal: boolean, name: string, bright: boolean): Paint => {
    if (!live || !literal) return named(name, bright);
    const c = checkColor(theme.value(name));
    if (c === undefined) return named(name, bright);
    return bright ? brighter(c, theme.rgba(name)) : c;
  };
  // Slots wrap at v12's 12 classes first, so boxes that share a `section-<n>` class share
  // their colour, then at a shorter author list.
  const at = (slot: number, length: number): number => (slot % PALETTE_SLOTS) % length;
  const slotted = (name: PaletteName, slot: number, bright: boolean): Paint | undefined => {
    const list = theme.palette(name);
    if (list.length === 0) return undefined;
    const i = at(slot, list.length);
    return bright ? brighter(list[i]!, theme.paletteRgba(name)[i]) : list[i];
  };
  const gradient = theme.gradient() !== undefined;
  const widths = boxStrokes(theme);
  const weight = weightOf(theme.value('fontWeight'));
  const label: Attrs = {
    'font-weight': weight === NORMAL_WEIGHT ? undefined : (String(weight) as SafeValue),
  };

  let paintOf: (slot: number, bright: boolean) => BoxPaint;
  let line: Paint;
  let shadow: Shadow | undefined;
  if (scaleColors(theme)) {
    const fill = theme.palette('cScale');
    const inv = theme.palette('cScaleInv');
    const text = theme.palette('cScaleLabel');
    // v12 repeats `.lineWrapper line` once per slot, so the last slot's label colour wins.
    line = slotted('cScaleLabel', PALETTE_SLOTS - 1, false) ?? named('nodeBorder', false);
    // The fallbacks, read now so the root declares them.
    if (gradient || fill.length === 0) named('mainBkg', false);
    if (gradient || inv.length === 0 || text.length === 0) named('nodeBorder', false);
    const outline = gradient ? theme.outline('nodeBorder') : undefined;
    paintOf = (slot, bright) => {
      const tint = gradient ? undefined : slotted('cScale', slot, bright);
      const lit = tint !== undefined;
      return {
        fill: tint ?? named('mainBkg', bright),
        stroke: outline,
        strokeWidth: gradient ? (widths.outline as Length) : undefined,
        text: slotted('cScaleLabel', slot, bright) ?? on(lit, 'nodeBorder', bright),
        rule: {
          stroke: gradient
            ? named('nodeBorder', bright)
            : (slotted('cScaleInv', slot, bright) ?? on(lit, 'nodeBorder', bright)),
          width: widths.rule,
        },
      };
    };
  } else {
    // D257: the border palette slot fills where the theme carries a fill palette too.
    const border = theme.palette('borderColorArray');
    const solid = theme.palette('bkgColorArray').length > 0;
    line = named('nodeBorder', false);
    shadow = theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow');
    const outline = theme.outline('nodeBorder');
    const strokeWidth = theme.length('strokeWidth');
    if (!solid || border.length === 0) named('mainBkg', false);
    paintOf = (slot, bright) => {
      const tint = slotted('borderColorArray', slot, bright);
      const lit = solid && tint !== undefined;
      return {
        fill: (solid ? tint : undefined) ?? named('mainBkg', bright),
        // The palette slot wins over the gradient (theming.md); an event's plain outline is
        // brightened with the rest of its group, a gradient one is not.
        stroke: tint ?? (gradient ? outline : named('nodeBorder', bright)),
        strokeWidth,
        text: on(lit, 'nodeBorder', bright),
        colorId: border.length > 0 ? `color-${at(slot, border.length)}` : undefined,
      };
    };
  }
  const radius = theme.number('timelineRadius');
  const shift = theme.number('timelineEventLabelShift');
  return {
    box: (slot) => paintOf(slot, false),
    event: (slot) => paintOf(slot, true),
    line,
    title: titled ? theme.color('textColor') : 'none',
    radius,
    labelOffset: (padding) => theme.padding('timelineLabelOffset', padding),
    eventLabelOffset: (padding) => padding * EVENT_OFFSET_SHARE + shift,
    shadow,
    label,
  };
}
