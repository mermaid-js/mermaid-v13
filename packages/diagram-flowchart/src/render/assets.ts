// Image and icon nodes (`img`, `icon`): the asset box with its label above or below it.
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
