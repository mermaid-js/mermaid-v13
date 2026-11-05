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
import { formatColor, PALETTE_LIMIT, parseColor } from '@mermaid-js/core/theme';
import { scaleColors } from '../layout/env.ts';

type Theme = RenderContext['theme'];
type Length = ReturnType<Theme['length']>;
type Shadow = ReturnType<Theme['filter']>;

/** v12 `styles.js`: the `cScaleInv` rule under a classic box, and the gradient outline. */
const RULE_WIDTH = 3;
const GRADIENT_WIDTH = 2;
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

/** `c` at 120% brightness, as CSS `brightness()` computes it in sRGB; `c` when JS can't parse it. */
function brighter(c: string): Paint {
  const rgba = parseColor(c);
  if (!rgba) return c as Paint;
  const up = (v: number): number => Math.min(255, v * EVENT_BRIGHTNESS);
  return checkColor(formatColor([up(rgba[0]), up(rgba[1]), up(rgba[2]), rgba[3]])) ?? (c as Paint);
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
    const rgba = theme.rgba(name);
    return rgba ? brighter(formatColor(rgba)) : ref;
  };
  const slotted = (list: readonly string[], slot: number, bright: boolean): Paint | undefined => {
    if (list.length === 0) return undefined;
    const c = list[slot % list.length]!;
    return bright ? brighter(c) : (c as Paint);
  };
  const gradient = theme.gradient() !== undefined;
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
    line = slotted(text, PALETTE_LIMIT - 1, false) ?? theme.color('nodeBorder');
    if (gradient) {
      named('mainBkg', false);
      named('nodeBorder', false);
    }
    const outline = gradient ? theme.outline('nodeBorder') : undefined;
    paintOf = (slot, bright) => ({
      fill: gradient
        ? named('mainBkg', bright)
        : (slotted(fill, slot, bright) ?? named('mainBkg', bright)),
      stroke: outline,
      strokeWidth: gradient ? (GRADIENT_WIDTH as Length) : undefined,
      text: slotted(text, slot, bright) ?? named('nodeBorder', bright),
      rule: gradient
        ? { stroke: named('nodeBorder', bright), width: GRADIENT_WIDTH }
        : { stroke: slotted(inv, slot, bright) ?? named('nodeBorder', bright), width: RULE_WIDTH },
    });
  } else {
    // D257: the border palette slot fills where the theme carries a fill palette too.
    const border = theme.palette('borderColorArray');
    const solid = theme.palette('bkgColorArray').length > 0;
    line = theme.color('nodeBorder');
    shadow = theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow');
    const outline = theme.outline('nodeBorder');
    const strokeWidth = theme.length('strokeWidth');
    if (!solid) named('mainBkg', false);
    paintOf = (slot, bright) => {
      const tint = slotted(border, slot, bright);
      return {
        fill: (solid ? tint : undefined) ?? named('mainBkg', bright),
        stroke: tint ?? outline,
        strokeWidth,
        text: named('nodeBorder', bright),
        colorId: border.length > 0 ? `color-${slot % border.length}` : undefined,
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
