/**
 * How the gitGraph renderer paints each part (spec #292 T4, D152, D267): v12's `styles.js` per
 * theme family, as theme variables. No theme name and no `look` (D153). Every variable is read
 * here, before the root is written, so the root's style declares each alias it refers to.
 *
 * One palette slot per branch for all its parts (D267), computed as v12 does for bullets: the
 * branch index modulo the 8 git colours, or, with a non-empty `borderColorArray`, slot 0 for
 * the first branch and 1–7 round the rest (v12 `calcColorIndex`). Slot 0 then takes the node
 * colours, the others the border palette.
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  checkColor,
  type Length,
  type OutlinePaint,
  type Paint,
  type SafeColor,
  type SafeFilter,
  type SafeValue,
  type ThemeRef,
} from '@mermaid-js/core/svg';
import { GIT_PAINT } from './variables.ts';

type Theme = RenderContext['theme'];
type PaletteName = Parameters<Theme['palette']>[0];

/** v12 `THEME_COLOR_LIMIT` for bullets and arrows (core's `GIT_PALETTE_LIMIT`, D267). */
const GIT_SLOTS = 8;

/** v12 classic: reverse crosses 3 px wide; commit label backgrounds at half opacity. */
const CLASSIC_CROSS_WIDTH = 3;
const CLASSIC_LABEL_OPACITY = 0.5;
/** v12 branch lines: `stroke-dasharray: 2` classic, `4 2` with the node colours. */
const CLASSIC_DASH = '2' as SafeValue;
const NODE_DASH = '4 2' as SafeValue;

/** The colours of one branch's parts. */
interface SlotPaint {
  /** Bullets (stroke and fill), arrows. */
  readonly ink: Paint;
  /** A highlight bullet's outer square. */
  readonly highlight: { readonly fill: Paint; readonly stroke: Paint };
  /** The branch name's box; no stroke where v12 drew none. */
  readonly box: {
    readonly fill: Paint;
    readonly stroke?: OutlinePaint;
    readonly strokeWidth?: Length;
  };
  /** The branch name. */
  readonly name: Paint;
}

export interface Paints {
  /** The palette slot of branch `index` (D267). */
  slot(index: number): number;
  /** The colours of slot `slot`. */
  lane(slot: number): SlotPaint;
  /** Merge and highlight insides, reverse crosses. */
  readonly inset: Paint;
  readonly crossWidth: Length;
  /** A cherry-pick bullet: its body (classic: `textColor`, v12's root `fill` rule) and its ink. */
  readonly cherry: { readonly fill: Paint; readonly ink: Paint };
  /** Branch lines. */
  readonly line: { readonly stroke: Paint; readonly dash: SafeValue };
  readonly commitLabel: {
    readonly text: Paint;
    readonly fill: Paint;
    readonly opacity?: number;
    readonly size: Length;
  };
  readonly tag: {
    readonly fill: Paint;
    readonly stroke: Paint;
    readonly text: Paint;
    readonly hole: Paint;
    readonly filter?: SafeFilter | ThemeRef;
    readonly size: Length;
  };
  /** The theme's shadow on branch label boxes (D182); undefined where it is `none`. */
  readonly boxFilter?: SafeFilter | ThemeRef;
  /** `fontWeight`, which the layout measured branch names and ids at (pitfall 16). */
  readonly weight?: SafeValue;
  readonly title: Paint;
  /** Bullet geometry (D152). */
  readonly highlightInner: number;
  readonly mergeRadius: number;
  readonly reverseCross: number;
  readonly cherryPickDot: number;
}

/** What a theme gives a colour variable it has no value or rule for. */
const UNSET = 'currentColor';
/** v12's cherry-pick ink where a theme sets none: white (v12 `isDark ? '#000000' : '#fff'`). */
const CHERRY_INK = checkColor('#ffffff')!;

const flagOf = (theme: Theme, name: string): boolean => theme.value(name) === 'true';
/** A colour variable, or `fallback` where the theme gives it no value (v12's `??`). */
const colorOr = (theme: Theme, name: string, fallback: Paint): Paint =>
  theme.value(name) === UNSET ? fallback : theme.color(name);

const weightOf = (value: string): SafeValue | undefined =>
  value === 'normal' || value === '400' ? undefined : (value as SafeValue);

export function paints(ctx: Pick<RenderContext, 'theme'>, titled: boolean): Paints {
  const { theme } = ctx;
  const nodeColors = flagOf(theme, GIT_PAINT.nodeColors);
  const paletteColors = flagOf(theme, GIT_PAINT.paletteColors);
  const border = theme.palette('borderColorArray');
  const bordered = border.length > 0;
  const nodeBorder = theme.color('nodeBorder');
  const mainBkg = theme.color('mainBkg');
  const strokeWidth = theme.length('strokeWidth');
  const palettes = new Map<PaletteName, readonly SafeColor[]>();
  const listOf = (name: PaletteName): readonly SafeColor[] => {
    let list = palettes.get(name);
    if (!list) palettes.set(name, (list = theme.palette(name)));
    return list;
  };
  const at = (name: PaletteName, slot: number): Paint => {
    const list = listOf(name);
    return list.length === 0 ? nodeBorder : list[slot % list.length]!;
  };
  // Slot 0 takes the node colours with the border palette (v12 colour themes) and with the
  // node colours on (v12 neo); without the git palettes every slot does (v12 redux).
  const plain = (slot: number): boolean =>
    bordered ? slot === 0 : !paletteColors || (nodeColors && slot === 0);
  const boxOutline = nodeColors ? theme.outline('nodeBorder') : undefined;

  const laneOf = (slot: number): SlotPaint => {
    if (plain(slot)) {
      return {
        ink: nodeBorder,
        highlight: { fill: bordered ? mainBkg : nodeBorder, stroke: nodeBorder },
        box: { fill: mainBkg, stroke: boxOutline ?? nodeBorder, strokeWidth },
        name: nodeBorder,
      };
    }
    if (bordered) {
      const c = border[slot % border.length]!;
      return {
        ink: c,
        highlight: { fill: c, stroke: c },
        box: nodeColors
          ? { fill: theme.dark ? mainBkg : c, stroke: c, strokeWidth }
          : { fill: c, stroke: c, strokeWidth },
        name: nodeBorder,
      };
    }
    const ink = at('git', slot);
    const inv = at('gitInv', slot);
    return {
      ink,
      highlight: { fill: inv, stroke: inv },
      box: nodeColors ? { fill: mainBkg, stroke: boxOutline, strokeWidth } : { fill: ink },
      name: at('gitBranchLabel', slot),
    };
  };
  const lanes = new Map<number, SlotPaint>();

  const shadow = theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow');
  const commitLabel = nodeColors
    ? { text: nodeBorder, fill: 'none' as const }
    : {
        text: theme.color('commitLabelColor'),
        fill: theme.color('commitLabelBackground'),
        opacity: CLASSIC_LABEL_OPACITY,
      };
  const tag = nodeColors
    ? { fill: mainBkg, stroke: nodeBorder, filter: shadow }
    : { fill: theme.color('tagLabelBackground'), stroke: theme.color('tagLabelBorder') };
  return {
    slot(index) {
      if (!bordered) return index % GIT_SLOTS;
      return index === 0 ? 0 : ((index - 1) % (GIT_SLOTS - 1)) + 1;
    },
    lane(slot) {
      let p = lanes.get(slot);
      if (!p) lanes.set(slot, (p = laneOf(slot)));
      return p;
    },
    inset: nodeColors ? mainBkg : theme.color('primaryColor'),
    crossWidth: nodeColors ? strokeWidth : CLASSIC_CROSS_WIDTH,
    cherry: {
      fill: nodeColors ? nodeBorder : theme.color('textColor'),
      ink: colorOr(theme, GIT_PAINT.cherryPickInk, CHERRY_INK),
    },
    line: {
      stroke: colorOr(theme, GIT_PAINT.commitLineColor, theme.color('lineColor')),
      dash: nodeColors ? NODE_DASH : CLASSIC_DASH,
    },
    commitLabel: { ...commitLabel, size: theme.length('commitLabelFontSize') },
    tag: {
      ...tag,
      text: theme.color('tagLabelColor'),
      hole: theme.color('textColor'),
      size: theme.length('tagLabelFontSize'),
    },
    boxFilter: shadow,
    weight: weightOf(theme.value('fontWeight')),
    title: titled ? theme.color('textColor') : 'none',
    highlightInner: theme.number(GIT_PAINT.highlightInner),
    mergeRadius: theme.number(GIT_PAINT.mergeRadius),
    reverseCross: theme.number(GIT_PAINT.reverseCross),
    cherryPickDot: theme.number(GIT_PAINT.cherryPickDot),
  };
}
