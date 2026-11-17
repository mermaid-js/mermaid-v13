/**
 * The `<svg>` document root and small renderer helpers every diagram shares.
 */
import type { Warning } from '@mermaid-js/core';
import {
  checkColor,
  checkStyle,
  px,
  styleScope,
  styleText,
  themeStyleSheet,
} from '@mermaid-js/core/svg';
import type {
  Attrs,
  CheckedStyle,
  Paint,
  SafeColor,
  StyleText,
  SvgWriter,
  ThemeRef,
  Warn,
} from '@mermaid-js/core/svg';

/** The part of a render context the root reads. `idPrefix` is read only when an id is written. */
export interface RootContext {
  readonly theme: {
    rootStyleText(): StyleText;
    autoDeclarations():
      | {
          readonly light: Readonly<Record<string, ThemeRef>>;
          readonly dark: Readonly<Record<string, ThemeRef>>;
        }
      | undefined;
  };
  readonly idPrefix?: string | undefined;
  readonly version?: string | undefined;
}

/** A drawing's extent, as a layout gives it. */
export interface Bounds {
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
}

export interface RootOptions {
  /** The class after `mermaid mermaid-`: the diagram's name, then any v12 class it keeps. */
  readonly name: string;
  /** `aria-roledescription`; the first word of `name` when omitted. */
  readonly roleDescription?: string;
  /**
   * `[x, y, width, height]`, already rounded; or the drawing's bounds, whose width and height
   * are rounded up to whole pixels, at least 1 (`x` and `y` default to 0).
   */
  readonly viewBox: readonly [number, number, number, number] | Bounds;
  /** `useMaxWidth`: full width up to the drawing's, else the drawing's own size. */
  readonly maxWidth: boolean;
  /** The accessible title and description, written trimmed; a blank one is not written. */
  readonly title?: string | undefined;
  readonly desc?: string | undefined;
  /** Attributes the drawing inherits (font, fill…), written after `style`. */
  readonly attrs?: Attrs;
}

/** A `<title>` or `<desc>` holding `text`. */
export function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id?: string): void {
  w.open(tag, id === undefined ? undefined : { id });
  w.text(text);
  w.close();
}

/**
 * Opens the `<svg>` root: its size, its accessible name, the theme's aliases and, for
 * `theme: 'auto'`, their style sheet. The theme values the drawing inherits must be read before
 * the call, so that the root declares their aliases.
 */
export function openSvgRoot(w: SvgWriter, ctx: RootContext, o: RootOptions): void {
  const { theme } = ctx;
  const prefix = (): string => ctx.idPrefix ?? 'mermaid';
  const b = o.viewBox;
  const up = (n: number): number => Math.max(1, Math.ceil(n));
  const viewBox = 'width' in b ? ([b.x ?? 0, b.y ?? 0, up(b.width), up(b.height)] as const) : b;
  const width = viewBox[2];
  const auto = theme.autoDeclarations();
  const { maxWidth } = o;
  const title = o.title?.trim();
  const desc = o.desc?.trim();
  const space = o.name.indexOf(' ');
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: `mermaid mermaid-${o.name}`,
    viewBox,
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : viewBox[3],
    role: 'img',
    'aria-roledescription': o.roleDescription ?? (space < 0 ? o.name : o.name.slice(0, space)),
    'aria-labelledby': title ? `${prefix()}-title` : undefined,
    'aria-describedby': desc ? `${prefix()}-desc` : undefined,
    'data-mermaid-version': ctx.version ?? '13',
    'data-p': auto ? styleScope(prefix()) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    ...o.attrs,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix()), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix()}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix()}-desc`);
}

/** Class names as a suffix for a `class` attribute: each stripped to `[\w-]`, led by a space. */
export function cls(names: readonly string[]): string {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
}

/** The pointer cursor of a clickable node: its classes include `clickable` (#355, D605). */
export const clickCursor = (classes: readonly string[]): 'pointer' | undefined =>
  classes.includes('clickable') ? 'pointer' : undefined;

/** A colour written in the source of a renderer, as a paint. */
export const fixedPaint = (c: string): Paint => checkColor(c) as Paint;

export const centreX = (r: { readonly x: number; readonly width: number }): number =>
  r.x + r.width / 2;
export const centreY = (r: { readonly y: number; readonly height: number }): number =>
  r.y + r.height / 2;

/** A slot of the theme's colour palette (v12 `color-<n>`). */
export interface PaletteTint {
  readonly id: `color-${number}`;
  readonly stroke: SafeColor;
  readonly fill: SafeColor | undefined;
}

/**
 * The palette slot of the `order`-th thing, or undefined when the theme has no palette. The
 * fill is the order's entry of `bkgColorArray`, or the slot's with `fillBy: 'slot'` (v12
 * `genColor`); the two differ only when the arrays' lengths do.
 */
export function paletteSlots(
  theme: { palette(name: 'borderColorArray' | 'bkgColorArray'): readonly SafeColor[] },
  fillBy: 'order' | 'slot' = 'order'
): (order: number) => PaletteTint | undefined {
  const border = theme.palette('borderColorArray');
  const bkg = theme.palette('bkgColorArray');
  return (order) => {
    if (border.length === 0) return undefined;
    const slot = order % border.length;
    return {
      id: `color-${slot}`,
      stroke: border[slot]!,
      fill: bkg.length > 0 ? bkg[(fillBy === 'slot' ? slot : order) % bkg.length] : undefined,
    };
  };
}

/**
 * The checked style of a thing from its classes' declarations, then its own; one check per
 * distinct list. `base` names classes every thing takes first.
 */
export function styleCache(
  classDefs: ReadonlyMap<string, readonly string[]>,
  warn: Warn,
  base: readonly string[] = []
): (classes: readonly string[], own?: readonly string[]) => CheckedStyle {
  const styles = new Map<string, CheckedStyle>();
  const add = (decls: string[], name: string): void => {
    for (const s of classDefs.get(name) ?? []) decls.push(s.trim());
  };
  return (classes, own = []) => {
    const decls: string[] = [];
    for (const name of base) add(decls, name);
    for (const name of classes) add(decls, name);
    for (const s of own) decls.push(s.trim());
    const key = decls.join(';');
    let style = styles.get(key);
    if (!style) styles.set(key, (style = checkStyle(decls, warn)));
    return style;
  };
}

/** An edge that may carry v12's `animate` or `animation` metadata. */
export interface AnimatedEdge {
  readonly animate?: boolean;
  readonly animation?: string;
}

/**
 * v13 parses edge `animate` and `animation` but draws no animation (R-SEC-2: the keyframes need
 * a `<style>`; the edge keeps only its `edge-animation-*` class). Raises one
 * `EDGE_ANIMATION_IGNORED` for each of the two features the edges use, so the author learns why
 * nothing moves.
 */
export function warnIgnoredAnimation(
  edges: Iterable<AnimatedEdge>,
  warn: (warning: Warning) => void
): void {
  let animate = false;
  let animation = false;
  for (const e of edges) {
    animate ||= e.animate === true;
    animation ||= e.animation !== undefined;
  }
  for (const [used, feature] of [
    [animate, 'animate'],
    [animation, 'animation'],
  ] as const)
    if (used)
      warn({
        code: 'EDGE_ANIMATION_IGNORED',
        message: `Edge \`${feature}\` is ignored: v13 parses it but draws no edge animation. The edge keeps its \`edge-animation-*\` class, which draws nothing.`,
      });
}
