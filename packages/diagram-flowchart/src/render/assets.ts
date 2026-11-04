// Image and icon nodes (`img`, `icon`): the asset box with its label above or below it.
import { checkImageUrl, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import type { FlowRenderContext } from './context.ts';
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
 * Icon packs are not part of M1: the glyph is left out, and its frame drawn when it has a form.
 * The frame is a square of `assetHeight`, while `assetSize` widens the box to `assetWidth`.
 */
export function drawIcon(
  w: SvgWriter,
  view: NodeView,
  a: Attrs,
  warn: FlowRenderContext['warn']
): void {
  const v = view.vertex!;
  const size = asset(v.assetHeight, ICON);
  const top = assetTop(view, size);
  warn({
    code: 'ICON_UNAVAILABLE',
    message: `The icon ${JSON.stringify(v.icon!.slice(0, 60))} is not available; ${
      v.form ? 'its frame is drawn without it' : 'it is left out'
    }.`,
  });
  if (v.form === 'circle') w.leaf('circle', { cy: top + size / 2, r: size / 2, ...a });
  else if (v.form === 'square' || v.form === 'rounded') {
    w.leaf('rect', {
      x: -size / 2,
      y: top,
      width: size,
      height: size,
      rx: v.form === 'rounded' ? 8 : undefined,
      ...a,
    });
  }
}
