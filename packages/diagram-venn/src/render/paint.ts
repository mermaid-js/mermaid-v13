/**
 * Venn's paints (spec #429 §Renderer, v12 `vennRenderer.ts:117-229`), read from the theme and the
 * `style` statements before the root is written, so its style declares every alias they use.
 *
 * - **Circle**: the base is the style's `fill`, else the slot colour ({@link VennPaints.slot}),
 *   with `fill-opacity` from the style or 0.1, the stroke from the style or the base, and
 *   `stroke-opacity` 0.95. Its label is the style's `color`, else the base lightened by 30 HSL
 *   points when the background is dark, darkened by 30 otherwise (khroma's `isDark` of the
 *   resolved `background`, as v12; not the theme's `dark` trait).
 * - **Overlap**: transparent unless the style gives a `fill` (then at opacity 1); its label the
 *   style's `color`, else `vennSetTextColor`.
 * - **Text node**: its own style's `color`, else `vennSetTextColor`. **Title**: `vennTitleTextColor`.
 *
 * A slot colour is, in order: the author's own `venn<slot + 1>`; with a palette (a non-empty
 * `borderColorArray`, as in redux-color and redux-dark-color, or an author's), its entry
 * `slot mod length`; else the theme's `venn<slot + 1>` (`theme/table.ts`), which falls back to
 * `primaryColor`. Never by theme name (D331).
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
  /** The colour of slot `slot` and its channels, where JS can compute them. */
  slot(slot: number): { readonly paint: Paint; readonly rgba: Rgba | undefined };
  circle(sets: readonly string[], slot: number): CirclePaint;
  overlap(sets: readonly string[]): OverlapPaint;
  textNode(id: string): Paint;
  title(): Paint;
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

  const authored = (ctx.config.themeVariables ?? {}) as Readonly<Record<string, unknown>>;
  const palette = theme.palette('borderColorArray');
  const slot = (s: number): { paint: Paint; rgba: Rgba | undefined } => {
    const name = slotVar(s);
    if (palette.length > 0 && !Object.hasOwn(authored, name)) {
      const c = palette[s % palette.length]!;
      return { paint: c, rgba: parseColor(c) };
    }
    return { paint: theme.color(name), rgba: theme.rgba(name) };
  };

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
    slot,
    circle(sets, s) {
      const st = styled(sets);
      const base = st.fill ? { paint: st.fill, rgba: parseColor(st.fill) } : slot(s);
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
