// Image and icon nodes (`img`, `icon`): the asset box with its label above or below it.
import {
  checkImageUrl,
  translate,
  writeFragment,
  type Attrs,
  type OutlinePaint,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { FlowRenderContext, FlowWarning } from './context.ts';
import type { NodeView } from './prepare.ts';
import type { ShapeSize } from './shapes.ts';

/** An image or icon node's asset and label, in px (`img`, `icon`, `assetWidth`, `pos`). */
export interface AssetNode {
  img?: string;
  assetWidth?: number;
  assetHeight?: number;
  pos?: string;
}

const IMG = 80;
const ICON = 48;
const asset = (v: number | undefined, fallback: number): number =>
  v !== undefined && v > 0 && v <= 4000 ? v : fallback;

/** The box of an image or icon node: the asset with its label above or below it. */
export function assetSize(v: AssetNode, tw: number, th: number): ShapeSize {
  const aw = asset(v.assetWidth, v.img ? IMG : ICON);
  const ah = asset(v.assetHeight, v.img ? IMG : ICON);
  const top = v.pos === 't';
  return {
    w: Math.max(aw, tw + 8),
    h: ah + (th > 0 ? th + 6 : 0),
    dy: th > 0 ? (top ? -ah / 2 : ah / 2) - (top ? 3 : -3) : 0,
  };
}

// The asset box sits above or below the label (`pos: t` puts the label on top).
function assetTop(view: NodeView, size: number): number {
  if (view.label.height === 0) return -size / 2;
  return view.vertex?.pos === 't' ? view.h / 2 - size : -view.h / 2;
}

export function drawImage(
  w: SvgWriter,
  view: NodeView,
  url: string,
  securityLevel: 'default' | 'strict',
  warn: FlowRenderContext['warn']
): void {
  const v = view.vertex!;
  const href = checkImageUrl(url, { securityLevel, warn });
  const aw = asset(v.assetWidth, IMG);
  const ah = asset(v.assetHeight, IMG);
  if (!href) return;
  w.leaf('image', {
    href,
    x: -aw / 2,
    y: assetTop(view, ah),
    width: aw,
    height: ah,
    preserveAspectRatio: v.constraint === 'on' ? 'xMidYMid meet' : 'none',
  });
}

/**
 * The frame, when the icon has a form, then the glyph an extension has for it (D293, the context's
 * `icon`), in the frame's square. With the glyph (D298) the frame is borderless (its stroke is its
 * fill) and the glyph takes `paint`, which the extension applies (`GlyphOptions.paint`): its
 * `color`, or under `useGradient` the gradient on its `currentColor` paints. Without one the frame
 * keeps its outline, as before the icons plugin. The frame is a square of `assetHeight`, while
 * `assetSize` widens the box to `assetWidth`. Not drawn (no extension has glyphs, one gave
 * `null`, or none has this one), it warns as {@link iconMissed}; a placeholder (`'pending'`, D299)
 * draws the frame alone, quietly.
 */
export function drawIcon(
  w: SvgWriter,
  view: NodeView,
  a: Attrs,
  paint: OutlinePaint,
  ctx: FlowRenderContext
): void {
  const v = view.vertex!;
  const size = asset(v.assetHeight, ICON);
  const top = assetTop(view, size);
  const found = ctx.icon?.(v.icon!, size, { paint, pending: true });
  if (found === null || found === undefined) iconMissed(ctx, found);
  const glyph = found === 'pending' ? undefined : found;
  const f: Attrs = glyph ? { ...a, stroke: a.fill } : a;
  if (v.form === 'circle') w.outline('node', 'circle', { cy: top + size / 2, r: size / 2, ...f });
  else if (v.form === 'square' || v.form === 'rounded') {
    w.outline('node', 'rect', {
      x: -size / 2,
      y: top,
      width: size,
      height: size,
      rx: v.form === 'rounded' ? 8 : undefined,
      ...f,
    });
  }
  if (!glyph) return;
  w.open('g', { transform: translate(-size / 2, top) });
  writeFragment(w, glyph);
  w.close();
}

/**
 * When an icon shape's glyph is not drawn: no extension has glyphs, or none has this one
 * (`undefined`), and flowchart says `ICON_NOT_RENDERED` itself; or one reported it unresolved
 * (`null`) and says `ICON_NOT_RENDERED` (D291), naming it. Beside it, for one alpha, the
 * deprecated alias `ICON_UNAVAILABLE` (D299), a fixed message as sequence's `SEQUENCE_MATH`. Both
 * go through the render's deduplicating `warn`, so each comes once per render. A placeholder
 * gives neither.
 */
function iconMissed(ctx: FlowRenderContext, found: null | undefined): void {
  const warn = ctx.inline?.warn ?? ((x: FlowWarning) => ctx.warn(x));
  if (!ctx.icon) {
    warn({
      code: 'ICON_NOT_RENDERED',
      message:
        'Icons are not rendered without an icons extension: icon shapes draw their frame alone, or nothing without a form.',
    });
  } else if (found === undefined) {
    warn({
      code: 'ICON_NOT_RENDERED',
      message:
        'Icons not rendered: no icons extension has a glyph for an icon shape, which draws its frame alone, or nothing without a form.',
    });
  }
  warn({
    code: 'ICON_UNAVAILABLE',
    message: 'ICON_UNAVAILABLE is deprecated and goes in the next alpha: read ICON_NOT_RENDERED.',
  });
}
