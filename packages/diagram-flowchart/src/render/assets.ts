// Image and icon nodes (`img`, `icon`): the asset box with its label above or below it.
import {
  checkImageUrl,
  translate,
  writeFragment,
  type Attrs,
  type OutlinePaint,
  type Paint,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';
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

/** Paints the fitted glyph's `currentColor` fills and strokes with `paint` (the gradient). */
function painted(node: SvgFragment, paint: OutlinePaint): SvgFragment {
  const attrs = node.attrs && { ...node.attrs };
  if (attrs) {
    for (const key of ['fill', 'stroke'] as const)
      if (typeof attrs[key] === 'string' && /^currentColor$/i.test(attrs[key])) attrs[key] = paint;
  }
  return {
    tag: node.tag,
    ...(attrs ? { attrs } : {}),
    ...(node.children
      ? { children: node.children.map((c) => (typeof c === 'string' ? c : painted(c, paint))) }
      : {}),
  };
}

/**
 * The frame, when the icon has a form, then the glyph an extension has for it (D293, the context's
 * `icon`), in the frame's square. With the glyph (D298) the frame is borderless (its stroke is its
 * fill) and the glyph takes `paint`: its `color`, or under `useGradient` the gradient on its
 * `currentColor` paints. Without one the frame keeps its outline, as before the icons plugin.
 * The frame is a square of `assetHeight`, while `assetSize` widens the box to `assetWidth`.
 * Returns whether the glyph was drawn.
 */
export function drawIcon(
  w: SvgWriter,
  view: NodeView,
  a: Attrs,
  paint: OutlinePaint,
  icon?: FlowRenderContext['icon']
): boolean {
  const v = view.vertex!;
  const size = asset(v.assetHeight, ICON);
  const top = assetTop(view, size);
  const glyph = icon?.(v.icon!, size);
  const f: Attrs = glyph ? { ...a, stroke: a.fill } : a;
  if (v.form === 'circle') w.leaf('circle', { cy: top + size / 2, r: size / 2, ...f });
  else if (v.form === 'square' || v.form === 'rounded') {
    w.leaf('rect', {
      x: -size / 2,
      y: top,
      width: size,
      height: size,
      rx: v.form === 'rounded' ? 8 : undefined,
      ...f,
    });
  }
  if (!glyph) return false;
  const gradient = paint.startsWith('url(');
  w.open('g', {
    transform: translate(-size / 2, top),
    color: gradient ? undefined : (paint as Paint),
  });
  writeFragment(w, gradient ? painted(glyph, paint) : glyph);
  w.close();
  return true;
}

/** How many icons a warning names, and how much of each. */
const LISTED = 8;
const QUOTE = 60;

/**
 * After the nodes: the icon shapes whose glyph was not drawn (`missed`, as written). Without an
 * extension that has glyphs, flowchart says `ICON_NOT_RENDERED` itself (with one, the extension
 * says it for the icons it cannot draw, D291). Next to it, once per render and for one alpha, the
 * deprecated alias `ICON_UNAVAILABLE` names them (D299, as sequence's `SEQUENCE_MATH`): not for a
 * placeholder render (`PLACEHOLDER`), where the extension gives no `ICON_NOT_RENDERED`. An
 * extension that warns only once the render is drawn (the icons extension, in `postRender`) gives
 * the alias itself.
 */
export function iconsNotDrawn(ctx: FlowRenderContext, missed: readonly string[]): void {
  if (missed.length === 0) return;
  const warn = ctx.inline?.warn ?? ((x: FlowWarning) => ctx.warn(x));
  if (!ctx.icon) {
    warn({
      code: 'ICON_NOT_RENDERED',
      message:
        'Icons are not rendered without an icons extension: icon shapes draw their frame alone.',
    });
  } else if (ctx.inline && !ctx.inline.notRendered('icon')) return;
  const names = [...new Set(missed)].map((n) =>
    JSON.stringify(n.length > QUOTE ? `${n.slice(0, QUOTE)}…` : n)
  );
  const more = names.length > LISTED ? ` and ${String(names.length - LISTED)} more` : '';
  const listed = names.slice(0, LISTED).join(', ') + more;
  ctx.warn({
    code: 'ICON_UNAVAILABLE',
    message: `ICON_UNAVAILABLE is deprecated and goes in the next alpha: read ICON_NOT_RENDERED. Icons not drawn: ${listed}; an icon with a form draws its frame alone.`,
  });
}
