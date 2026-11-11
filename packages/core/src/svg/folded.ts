/**
 * A folded embedded diagram (ADR-15, #670), the same in every host and for every inner type:
 * a frame with four corner brackets, the title, a divider, then a generic diagram icon and the
 * inner type in small capitals on one row. Hosts measure the two labels and lay the box out as
 * a fixed-size node; only the type text changes between types.
 */
import { pathBuilder, translate } from './path.ts';
import type { Attrs, Length, OutlinePaint, Paint } from './types.ts';
import type { LabelBox, SvgWriter } from './writer.ts';

/** Space left and right of the widest row. */
const PAD_X = 16;
/** Space above and below the title. */
const TITLE_PAD = 6;
/** Space above and below the icon row. */
const ROW_PAD = 8;
/** The icon, drawn at 0.8 × its 18 × 16 design size. */
const ICON = 0.8;
const ICON_W = 18 * ICON;
const ICON_H = 16 * ICON;
/** Between the icon and the type. */
const ICON_GAP = 6;
/** The corner brackets: inset from the border, arm length. */
const INSET = 4;
const ARM = 9;

/** The type's font size: capitals this size read as the small caps of a 13px font. */
export const FOLDED_TYPE_SIZE = 10;
/** The type's letter spacing, px. */
const FOLDED_TYPE_SPACING = 0.65;

interface Measured {
  readonly width: number;
  readonly height: number;
}

/** The type as written in the box: small capitals, drawn as capitals at the smaller size. */
export const foldedTypeText = (type: string): string => type.toUpperCase();

/** The type row's width: the icon, the gap and the type (`chars` letters, spaced). */
const rowWidth = (type: Measured, chars: number): number =>
  ICON_W + ICON_GAP + type.width + chars * FOLDED_TYPE_SPACING;

/** The folded box for a title and a type (`chars` letters), in px. */
export function foldedSize(title: Measured, type: Measured, chars: number): Measured {
  return {
    width: Math.max(title.width, rowWidth(type, chars)) + 2 * PAD_X,
    height: title.height + 2 * TITLE_PAD + 2 * ROW_PAD + Math.max(ICON_H, type.height),
  };
}

/**
 * The folded box in cells (text output), a text-form box: the title rows, a divider and the
 * type row, as wide as the wider label, with `pad` cells and a border cell round them.
 */
export function foldedCells(
  title: { readonly width: number; readonly rows: number },
  type: { readonly width: number },
  pad: { readonly x: number; readonly y: number }
): Measured {
  return {
    width: Math.max(title.width, type.width) + 2 * (pad.x + 1),
    height: title.rows + 2 + 2 * (pad.y + 1),
  };
}

/** How the folded box is painted: the host's frame, its title text and the muted type. */
export interface FoldedPaint {
  /** The frame (fill none, the host's border and width, the author's style). */
  readonly frame: Attrs;
  /** The marks: the brackets, the divider and the icon. */
  readonly mark: OutlinePaint;
  /** The icon's filled nodes. */
  readonly ink: Paint;
  /** The title's text attributes. */
  readonly title?: Attrs;
  /** The type's colour. */
  readonly muted: Paint;
}

/** The folded box's own colours from the host's theme: the marks' ink and the muted type. */
export const foldedInk = (theme: {
  color(name: 'nodeBorder' | 'mutedBorder'): Paint;
}): Pick<FoldedPaint, 'ink' | 'muted'> => ({
  ink: theme.color('nodeBorder'),
  muted: theme.color('mutedBorder'),
});

/**
 * Draws the folded box `size` centred on (0, 0): `title` and `type` are the measured labels
 * (`type` measured at {@link FOLDED_TYPE_SIZE}), `chars` the type's letters.
 */
export function drawFolded(
  w: SvgWriter,
  size: Measured,
  title: LabelBox,
  type: LabelBox & Measured,
  chars: number,
  paint: FoldedPaint
): void {
  const { width, height } = size;
  const left = -width / 2;
  const top = -height / 2;
  const { mark } = paint;
  const thin = { fill: 'none', stroke: mark } as const;
  w.outline('node', 'rect', { x: left, y: top, width, height, rx: 2, ...paint.frame });
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    // (sx, sy) points into the box from its corner.
    const x = -sx * (width / 2 - INSET);
    const y = -sy * (height / 2 - INSET);
    const d = pathBuilder()
      .moveTo(x, y + sy * ARM)
      .lineTo(x, y)
      .lineTo(x + sx * ARM, y)
      .done();
    w.outline('mark', 'path', { class: 'corner', d, ...thin, 'stroke-width': 1.6 });
  }
  const divider = top + title.height + 2 * TITLE_PAD;
  w.label(title, 0, top + TITLE_PAD + title.height / 2, paint.title);
  w.outline('divider', 'line', {
    class: 'divider',
    x1: left + PAD_X,
    y1: divider,
    x2: -left - PAD_X,
    y2: divider,
    stroke: mark,
    'stroke-width': 1,
    'stroke-opacity': 0.55,
  });
  const row = Math.max(ICON_H, type.height);
  const cy = divider + ROW_PAD + row / 2;
  const x0 = -rowWidth(type, chars) / 2;
  drawIcon(w, x0, cy - ICON_H / 2, paint);
  const spacing: Length = FOLDED_TYPE_SPACING;
  w.label(type, x0 + ICON_W + ICON_GAP + (type.width + chars * spacing) / 2, cy, {
    fill: paint.muted,
    'font-size': FOLDED_TYPE_SIZE,
    'letter-spacing': spacing,
  });
}

/** The I3 icon (a framed picture of a diagram: two nodes joined by an elbow), top-left at x, y. */
function drawIcon(w: SvgWriter, x: number, y: number, paint: FoldedPaint): void {
  const s = ICON;
  const line = { fill: 'none', stroke: paint.mark, 'stroke-width': 1.1 * s } as const;
  w.open('g', { class: 'diagram-icon', transform: translate(x, y) });
  w.outline('mark', 'rect', {
    x: 0.5 * s,
    y: 0.5 * s,
    width: 17 * s,
    height: 15 * s,
    rx: s,
    ...line,
  });
  for (const [nx, ny] of [
    [3, 4],
    [10.5, 8.8],
  ] as const)
    w.outline('mark', 'rect', {
      x: nx * s,
      y: ny * s,
      width: 4.5 * s,
      height: 3.2 * s,
      fill: paint.ink,
      stroke: 'none',
    });
  const d = pathBuilder()
    .moveTo(7.5 * s, 5.6 * s)
    .lineTo(12.75 * s, 5.6 * s)
    .lineTo(12.75 * s, 8.8 * s)
    .done();
  w.outline('mark', 'path', { d, ...line });
  w.close();
}
