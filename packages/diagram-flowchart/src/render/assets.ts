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

/** An image or icon node's asset, frame and label, in px (`img`, `form`, `assetWidth`, `pos`). */
export interface AssetNode {
  img?: string;
  assetWidth?: number;
  assetHeight?: number;
  pos?: string;
  form?: string;
}

const IMG = 80;
const ICON = 48;
const GAP = 6;
const FRAME_GAP = 8;
/** A rounded frame's corner radius (v12's `iconRounded`). */
const ROUNDED = 5;
const asset = (v: number | undefined, fallback: number): number =>
  v !== undefined && v > 0 && v <= 4000 ? v : fallback;

/**
 * The square an icon's frame fills (#1150, D685): the glyph's square plus half of `pad`
 * (`flowchart.padding`, so a quarter of it on each side) for `square` and `rounded`; for
 * `circle`, the diameter, the glyph's diagonal plus half of `pad`. v12 added all of `pad`
 * (`iconSquare`, `iconRounded`) and the diagonal plus 40. An icon without a frame, and an image,
 * keep their asset's height.
 */
function frameSize(v: AssetNode, pad: number): number {
  const size = asset(v.assetHeight, v.img ? IMG : ICON);
  if (!framed(v)) return size;
  return (v.form === 'circle' ? size * Math.SQRT2 : size) + pad / 2;
}

const framed = (v: AssetNode): boolean =>
  !v.img && (v.form === 'circle' || v.form === 'square' || v.form === 'rounded');

/**
 * The box of an image or icon node: the asset, or an icon's frame, with its label above or below
 * it, 6 px apart, or 8 from a frame (v12's label padding). `pad` is `flowchart.padding`.
 */
export function assetSize(v: AssetNode, tw: number, th: number, pad: number): ShapeSize {
  const aw = asset(v.assetWidth, v.img ? IMG : ICON);
  const ah = frameSize(v, pad);
  const gap = framed(v) ? FRAME_GAP : GAP;
  const top = v.pos === 't';
  return {
    w: Math.max(aw, framed(v) ? ah : 0, tw + 8),
    h: ah + (th > 0 ? th + gap : 0),
    dy: th > 0 ? ((top ? -1 : 1) * (ah + gap)) / 2 : 0,
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
 * `icon`), centred in the frame. With the glyph (D298) the frame is borderless (its stroke is its
 * fill) and the glyph takes `paint`, which the extension applies (`GlyphOptions.paint`): its
 * `color`, or under `useGradient` the gradient on its `currentColor` paints. Without one the frame
 * keeps its outline, as before the icons plugin. The glyph is a square of `assetHeight`, and the
 * frame leaves half of `pad` (`flowchart.padding`) around it ({@link frameSize}), while `assetSize`
 * widens the box to `assetWidth`. Not drawn (no extension has glyphs, one gave `null`, or none
 * has this one), it warns as {@link iconMissed}; a placeholder (`'pending'`, D299) draws the
 * frame alone, quietly.
 */
export function drawIcon(
  w: SvgWriter,
  view: NodeView,
  a: Attrs,
  paint: OutlinePaint,
  ctx: FlowRenderContext,
  pad: number
): void {
  const v = view.vertex!;
  const size = asset(v.assetHeight, ICON);
  const box = frameSize(v, pad);
  const top = assetTop(view, box);
  const found = ctx.icon?.(v.icon!, size, { paint, pending: true });
  if (found === null || found === undefined) iconMissed(ctx, found);
  const glyph = found === 'pending' ? undefined : found;
  const f: Attrs = glyph ? { ...a, stroke: a.fill } : a;
  if (v.form === 'circle') w.outline('node', 'circle', { cy: top + box / 2, r: box / 2, ...f });
  else if (framed(v)) {
    w.outline('node', 'rect', {
      x: -box / 2,
      y: top,
      width: box,
      height: box,
      rx: v.form === 'rounded' ? ROUNDED : undefined,
      ...f,
    });
  }
  if (!glyph) return;
  w.open('g', { transform: translate(-size / 2, top + (box - size) / 2) });
  writeFragment(w, glyph);
  w.close();
}

/** The label's band, from the frame (`top` to `bottom`) to the far side of the box; none without a label. */
function labelBand(view: NodeView, top: number, bottom: number): [number, number] | undefined {
  if (view.label.height === 0) return undefined;
  return view.vertex?.pos === 't' ? [-view.h / 2, top] : [bottom, view.h / 2];
}

/**
 * How far an edge end on a side of a framed icon's box (0 top, 1 right, 2 bottom, 3 left), `t`
 * along the side from its middle, moves in to meet the frame: the outline is the frame and the
 * label's band, the box's full width, as v12's icon outline polygon. An end beside the frame on
 * the label's side reaches the label band; an icon without a frame keeps its box (0).
 */
export function iconInset(view: NodeView, side: number, t: number, pad: number): number {
  const v = view.vertex!;
  if (!framed(v)) return 0;
  const box = frameSize(v, pad);
  const r = box / 2;
  const cy = assetTop(view, box) + r;
  const half = view.h / 2;
  const band = labelBand(view, cy - r, cy + r);
  // Half the frame's chord on the line `d` from its centre, or undefined if the line misses it.
  const chord = (d: number): number | undefined => {
    if (Math.abs(d) > r) return undefined;
    return v.form === 'circle' ? Math.sqrt(r * r - d * d) : r;
  };
  if (side & 1) {
    const c = chord(t - cy);
    const inBand = band !== undefined && t >= band[0] && t <= band[1];
    return c === undefined || inBand ? 0 : view.w / 2 - c;
  }
  const c = chord(t);
  const ys = [...(c === undefined ? [] : [cy - c, cy + c]), ...(band ?? [])];
  if (ys.length === 0) return 0;
  return side === 0 ? Math.min(...ys) + half : half - Math.max(...ys);
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
