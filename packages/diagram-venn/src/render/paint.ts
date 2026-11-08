/**
 * Venn's paints (spec #429 §Renderer, v12 `vennRenderer.ts:41-50, :117-229`), read from the theme
 * and the `style` statements before the root is written, so its style declares every alias they
 * use.
 *
 * - **Circle**: the base is the style's `fill`, else the set's colour (below), with
 *   `fill-opacity` from the style or 0.1, the stroke from the style or the base, and
 *   `stroke-opacity` 0.95. Its label is the style's `color`, else the base lightened by 30 HSL
 *   points when the background is dark, darkened by 30 otherwise (khroma's `isDark` of the
 *   resolved `background`, as v12; not the theme's `dark` trait).
 * - **Overlap**: transparent unless the style gives a `fill` (then at opacity 1); its label the
 *   style's `color`, else `vennSetTextColor`.
 * - **Text node**: its own style's `color`, else `vennSetTextColor`. **Title**: `vennTitleTextColor`.
 *
 * A set's colour is v12's `themeColors[i % n]`: the slot colours `venn1`–`venn8` that have a
 * value, in order, set `i` taking the `i mod n`th, and `primaryColor` when there are none. Slot
 * `k` has, in order: the author's own `venn<k>`; with a palette (a non-empty `borderColorArray`,
 * as in redux-color and redux-dark-color, or an author's), its entry `(k - 1) mod length`, as
 * those v12 themes filled their slots; else the theme's `venn<k>` (`theme/table.ts`: the classic
 * themes write all eight, redux and neo none). Never by theme name (D331).
 */
import {
  checkColor,
  checkStyle,
  type Attrs,
  type Paint,
  type SafeColor,
} from '@mermaid-js/core/svg';
import { formatColor, parseColor, type Rgba } from '@mermaid-js/core/theme';
import type { VennModel } from '../model.ts';
import { vennStyles } from '../layout/index.ts';
import { areaKey } from '../solver/index.ts';
import { VENN_SLOTS } from '../layout/metrics.ts';
import { slotVar } from '../theme/slots.ts';
import { isDark, shiftLightness } from './colour.ts';
import type { VennRenderContext } from './context.ts';

/** v12's fixed paint values (`vennRenderer.ts`), and its debug shapes' colours and dashes at 1600 px. */
export const VENN_PAINT = {
  /** A circle's `fill-opacity` when no style gives one. */
  circleFillOpacity: 0.1,
  circleStrokeOpacity: 0.95,
  /** A styled overlap's `fill-opacity`. */
  overlapFillOpacity: 1,
  /** The lightness a set label moves from its circle's colour. */
  labelShift: 30,
  /** v12's background when the theme has none it can read (`isDark(background || '#f4f4f4')`). */
  background: '#f4f4f4',
  debugCircle: 'purple',
  debugCell: 'teal',
  /** `useDebugLayout`'s dashes, in px at 1600 (× scale). */
  debugCircleDash: [6, 4],
  debugCellDash: [4, 3],
} as const;

/** A circle's paint. */
export interface CirclePaint {
  readonly fill: Paint;
  readonly fillOpacity: Attrs['fill-opacity'];
  readonly stroke: Paint;
  readonly label: Paint;
}

/** An overlap's paint: no fill unless styled. */
export interface OverlapPaint {
  readonly fill?: Paint;
  readonly label: Paint;
}

export interface VennPaints {
  /** The circle of the drawn set at `index` (0, 1, …) with the style of `sets`. */
  circle(sets: readonly string[], index: number): CirclePaint;
  overlap(sets: readonly string[]): OverlapPaint;
  textNode(id: string): Paint;
  title(): Paint;
}

/** A colour and its channels, where JS can compute them. */
interface Colour {
  readonly paint: Paint;
  readonly rgba: Rgba | undefined;
}

/** One style target's paints, as v12 reads them: `fill`, `fill-opacity`, `stroke`, `color`. */
interface Styled {
  readonly fill?: SafeColor;
  readonly fillOpacity?: Attrs['fill-opacity'];
  readonly stroke?: SafeColor;
  readonly color?: SafeColor;
}

const READ = ['fill', 'fill-opacity', 'stroke', 'color'] as const;

/** The paints of `model` under `ctx`'s theme. */
export function vennPaints(model: VennModel, ctx: VennRenderContext): VennPaints {
  const { theme } = ctx;
  const styles = vennStyles(model);
  const checked = new Map<string, Styled>();
  const styled = (sets: readonly string[]): Styled => {
    const key = areaKey(sets);
    let out = checked.get(key);
    if (out) return out;
    const props = styles.get(key) ?? {};
    const decls = READ.flatMap((k) => (props[k] === undefined ? [] : [`${k}:${props[k]}`]));
    const { shape, text } = checkStyle(decls, ctx.warn);
    out = {
      ...(shape.fill !== undefined ? { fill: shape.fill as SafeColor } : {}),
      ...(shape['fill-opacity'] !== undefined ? { fillOpacity: shape['fill-opacity'] } : {}),
      ...(shape.stroke !== undefined ? { stroke: shape.stroke as SafeColor } : {}),
      ...(text.fill !== undefined ? { color: text.fill as SafeColor } : {}),
    };
    checked.set(key, out);
    return out;
  };

  // Which slots the author wrote: an author's `venn<k>` comes before the palette, as in v12,
  // whose themes filled only the slots still unset. `Theme` resolves an author's value but does
  // not say whose a value is, so this reads the config the theme was built from.
  const authored = (ctx.config.themeVariables ?? {}) as Readonly<Record<string, unknown>>;
  const palette = theme.palette('borderColorArray');
  const slotColour = (k: number): Colour | undefined => {
    const name = slotVar(k);
    if (palette.length > 0 && !Object.hasOwn(authored, name)) {
      const c = palette[k % palette.length]!;
      return { paint: c, rgba: parseColor(c) };
    }
    // A slot neither the theme nor the author writes reads `currentColor` (redux, neo).
    if (theme.value(name) === 'currentColor') return undefined;
    return { paint: theme.color(name), rgba: theme.rgba(name) };
  };
  const written: Colour[] = [];
  for (let k = 0; k < VENN_SLOTS; k++) {
    const c = slotColour(k);
    if (c) written.push(c);
  }
  const setColour = (index: number): Colour =>
    written.length > 0
      ? written[index % written.length]!
      : { paint: theme.color('primaryColor'), rgba: theme.rgba('primaryColor') };

  const background = theme.rgba('background') ?? parseColor(VENN_PAINT.background)!;
  const shift = isDark(background) ? VENN_PAINT.labelShift : -VENN_PAINT.labelShift;
  let ink: Paint | undefined;
  const setText = (): Paint => (ink ??= theme.color('vennSetTextColor'));
  /** v12's label ink on a circle of colour `rgba`; the set ink where JS cannot compute it. */
  const labelOn = (rgba: Rgba | undefined): Paint => {
    const c = rgba && checkColor(formatColor(shiftLightness(rgba, shift)));
    return c ?? setText();
  };

  return {
    circle(sets, index) {
      const st = styled(sets);
      const base = st.fill ? { paint: st.fill, rgba: parseColor(st.fill) } : setColour(index);
      return {
        fill: base.paint,
        fillOpacity: st.fillOpacity ?? VENN_PAINT.circleFillOpacity,
        stroke: st.stroke ?? base.paint,
        label: st.color ?? labelOn(base.rgba),
      };
    },
    overlap(sets) {
      const st = styled(sets);
      return { ...(st.fill ? { fill: st.fill } : {}), label: st.color ?? setText() };
    },
    textNode: (id) => styled([id]).color ?? setText(),
    title: () => theme.color('vennTitleTextColor'),
  };
}
