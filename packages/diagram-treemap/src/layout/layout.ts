// cspell:words squarify squarified
/**
 * The treemap custom layout (spec #428 T3, `layoutKind: 'custom'`): `TreemapModel` in,
 * `TreemapLayout` out. It follows v12's `renderer.ts` with the drawing taken out: d3's
 * squarified treemap (`tiles.ts`), then each section's header label truncated and each leaf's
 * label fitted as v12 did, measured through the injected measurer (D405), values formatted by
 * `valueFormat` (D409), and the bounding box of what is drawn (D224). Lengths come from the
 * `treemap` config, the metrics table (pitfall 13) and, for the title, the theme (D407).
 *
 * v13 keeps text inside its box (R-LAYOUT-3): v12 clipped labels to their box, so a section
 * label or value that does not fit its section, and a label of a "complex" treemap still wider
 * than its leaf at the smallest size, would have been cut; here the section text is hidden and
 * the complex leaf label truncated with `...`.
 */
import type { RenderContext } from '@mermaid-js/core';
import { decodeEntities, type FontKey, type Measurer } from '@mermaid-js/core/text';
import { treemapLayoutConfig, type TreemapLayoutConfig } from '../config.ts';
import { treemapValueFormat } from '../format/index.ts';
import { classStyles, type TreemapModel } from '../model.ts';
import {
  BOLD_WEIGHT,
  FILL_SLOTS,
  LABEL_SLOTS,
  NORMAL_WEIGHT,
  TREEMAP_METRICS as M,
  type LeafFit,
} from './metrics.ts';
import { classFont, textWidth, truncate } from './text.ts';
import { tileTreemap, type Tile } from './tiles.ts';
import type {
  Rect,
  TreemapLayout,
  TreemapLeafLayout,
  TreemapSectionLayout,
  TreemapText,
  TreemapTextAnchor,
} from './types.ts';
import { RectUnion } from '@mermaid-js/shared/layout';
import { growRect } from '@mermaid-js/core/layout';

/** What the layout reads from the render context (`warn` for `TREEMAP_CONFIG_INVALID`). */
export type TreemapLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn'>>;

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

/** What every text of one layout is measured and formatted with. */
interface Frame {
  readonly measurer: Measurer;
  readonly family: string;
  readonly config: TreemapLayoutConfig;
  readonly format: (value: number) => string;
  readonly model: TreemapModel;
  /** The title band: every box moves down by it. */
  readonly band: number;
  /** `treemapTitleFontSize` (D407). */
  readonly titleSize: number;
}

/** Lays out a treemap in px. */
export function layoutTreemap(model: TreemapModel, ctx: TreemapLayoutContext): TreemapLayout {
  const config = treemapLayoutConfig(ctx.config.treemap, ctx.warn ?? ignoreWarning);
  const width = config.nodeWidth ? config.nodeWidth * M.canvasScale : M.fallbackWidth;
  const height = config.nodeHeight ? config.nodeHeight * M.canvasScale : M.fallbackHeight;
  const band = model.title ? M.titleBand : 0;
  const frame: Frame = {
    measurer: ctx.measurer,
    family: ctx.theme.value('fontFamily'),
    config,
    format: treemapValueFormat(config.valueFormat),
    model,
    band,
    titleSize: ctx.theme.number('treemapTitleFontSize'),
  };

  const tree = tileTreemap(model.roots, { width, height, padding: config.padding });
  const complex = tree.leaves.length > M.complexLeaves;
  const fit = complex ? M.complex : M.simple;

  // v12's ordinal scales take slots in first-lookup order: every section's fill (the hidden
  // root's `''` first, breadth first), then the labels of the sections and of the leaves. The
  // root keeps fill slot 0 and the sections cycle through 1…12, where v12 wrapped the 13th
  // name onto the root's `transparent` (D612).
  const fills = new Ordinal(FILL_SLOTS, 1);
  const labels = new Ordinal(LABEL_SLOTS);
  for (const t of tree.branches) fills.slot(t.node?.name ?? '');
  for (const t of tree.branches) if (t.node) labels.slot(t.node.name);
  for (const t of tree.leaves) if (t.node) labels.slot(t.node.name);

  const sections: TreemapSectionLayout[] = [];
  tree.branches.forEach((t, index) => {
    if (t.node) sections.push(sectionOf(t, index, frame, fills, labels));
  });
  const leaves: TreemapLeafLayout[] = [];
  tree.leaves.forEach((t, index) => {
    if (t.node) leaves.push(leafOf(t, index, frame, fit, fills, labels));
  });
  const title = model.title ? titleOf(model.title, width, frame) : undefined;

  const box = new Box();
  for (const s of sections) {
    box.add(growRect(s.box, M.sectionStroke / 2));
    box.add(s.header);
    if (s.label) box.add(s.label.box);
    if (s.valueText) box.add(s.valueText.box);
  }
  for (const l of leaves) {
    box.add(growRect(l.box, M.leafStroke / 2));
    if (l.label) box.add(l.label.box);
    if (l.valueText) box.add(l.valueText.box);
  }
  // With no rows v12 drew the hidden root as one transparent leaf over the canvas.
  if (sections.length === 0 && leaves.length === 0)
    box.add({ x: 0, y: 0, width, height: height + band });
  if (title) box.add(title.box);

  return {
    width,
    height,
    titleBand: band,
    padding: config.padding,
    complex,
    sections,
    leaves,
    ...(title ? { title } : {}),
    bounds: growRect(box.rect(), config.diagramPadding),
  };
}

/**
 * Whether a value is printed: under `showValues`, and not when 0 (v12 printed nothing for a
 * falsy value, so NaN neither) nor when not finite (D402: a sum that overflows, or a value of
 * 309 digits, prints nothing either).
 */
function shows(frame: Frame, value: number): boolean {
  return frame.config.showValues && value !== 0 && Number.isFinite(value);
}

/** d3's rectangle of `t`, moved down by the title band. */
function rectOf(t: Tile, band: number): Rect {
  return { x: t.x0, y: t.y0 + band, width: t.x1 - t.x0, height: t.y1 - t.y0 };
}

/** How far left of its point a text's box starts, in text widths. */
const ANCHOR_SHIFT: Readonly<Record<TreemapTextAnchor, number>> = {
  start: 0,
  middle: 1 / 2,
  end: 1,
};

/** One line at (`x`, `y`): its box from the anchor, the baseline and the font size. */
function placed(
  text: string,
  font: FontKey,
  measurer: Measurer,
  at: { x: number; y: number; anchor: TreemapTextAnchor; baseline: 'middle' | 'hanging' }
): TreemapText {
  const width = textWidth(measurer, text, font);
  const shift = ANCHOR_SHIFT[at.anchor] * width;
  const top = at.baseline === 'middle' ? at.y - font.size / 2 : at.y;
  return {
    text,
    font,
    x: at.x,
    y: at.y,
    anchor: at.anchor,
    baseline: at.baseline,
    box: { x: at.x - shift, y: top, width, height: font.size },
  };
}

/** `inner` lies inside `outer`. */
function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * A section (`:164-310`): its header label at `(6, 12.5)`, bold 12 px, truncated with `...` to
 * the space v12 left it (`w − 12`, or `w − 56` before a value; at least 15); its value
 * right-aligned at `w − 10`, 10 px. Either is hidden when it does not fit inside the section.
 */
function sectionOf(
  t: Tile,
  index: number,
  frame: Frame,
  fills: Ordinal,
  labels: Ordinal
): TreemapSectionLayout {
  const node = t.node!;
  const box = rectOf(t, frame.band);
  const styles = classStyles(frame.model, node.classSelector);
  const headerY = box.y + M.sectionHeader / 2;
  const showValue = shows(frame, t.value);

  const labelFont = classFont(styles, {
    family: frame.family,
    size: M.sectionLabelSize,
    weight: BOLD_WEIGHT,
  });
  const space = showValue
    ? box.width - M.sectionValueInset - M.sectionValueEstimate - M.sectionLabelGap - M.sectionLabelX
    : box.width - M.sectionLabelX - M.sectionLabelRightPad;
  const text = truncate(
    frame.measurer,
    decodeEntities(node.name),
    labelFont,
    Math.max(M.sectionLabelMinWidth, space)
  );
  const label =
    text === ''
      ? undefined
      : placed(text, labelFont, frame.measurer, {
          x: box.x + M.sectionLabelX,
          y: headerY,
          anchor: 'start',
          baseline: 'middle',
        });

  const valueText = showValue
    ? placed(
        frame.format(t.value),
        classFont(styles, {
          family: frame.family,
          size: M.sectionValueSize,
          weight: NORMAL_WEIGHT,
        }),
        frame.measurer,
        {
          x: box.x + box.width - M.sectionValueInset,
          y: headerY,
          anchor: 'end',
          baseline: 'middle',
        }
      )
    : undefined;

  return {
    index,
    node,
    depth: t.depth,
    value: t.value,
    box,
    header: { x: box.x, y: box.y, width: box.width, height: M.sectionHeader },
    colorKey: node.name,
    fill: fills.slot(node.name),
    labelColor: labels.slot(node.name),
    ...(label && inside(label.box, box) ? { label } : {}),
    ...(valueText && inside(valueText.box, box) ? { valueText } : {}),
  };
}

/**
 * A leaf (`:312-523`): its label centred, starting at 38 px (16 px past 20 leaves, or the
 * class's `font-size`), shrunk 1 px at a time to fit the width, then the height with the value
 * under it, hidden below the minimum; its value under it at 0.6 of the label's size, hidden
 * when it does not fit.
 */
function leafOf(
  t: Tile,
  index: number,
  frame: Frame,
  fit: LeafFit,
  fills: Ordinal,
  labels: Ordinal
): TreemapLeafLayout {
  const node = t.node!;
  const box = rectOf(t, frame.band);
  const colorKey = t.parent?.node?.name ?? '';
  const text = fitLeaf(t, box, frame, fit);
  return {
    index,
    node,
    depth: t.depth,
    value: t.value,
    box,
    colorKey,
    fill: fills.slot(colorKey),
    labelColor: labels.slot(node.name),
    ...text,
  };
}

/** v12's leaf label fitting and value placement, or nothing when the label is hidden. */
function fitLeaf(
  t: Tile,
  box: Rect,
  frame: Frame,
  fit: LeafFit
): Pick<TreemapLeafLayout, 'label' | 'valueText'> {
  const { measurer } = frame;
  const availableWidth = box.width - 2 * fit.padding;
  const availableHeight = box.height - 2 * fit.padding;
  if (availableWidth < fit.minBox || availableHeight < fit.minBox) return {};

  const start = classFont(classStyles(frame.model, t.node!.classSelector), {
    family: frame.family,
    size: fit.labelSize,
    weight: NORMAL_WEIGHT,
  });
  const font = (size: number): FontKey => ({ ...start, size });
  const name = decodeEntities(t.node!.name);
  const valueSize = (size: number): number =>
    Math.max(fit.minValueSize, Math.min(fit.valueSize, Math.round(size * M.valueScale)));

  // v12 read the size back with `parseInt`.
  let size = Math.trunc(start.size);
  // 1. Shrink to the width.
  while (textWidth(measurer, name, font(size)) > availableWidth && size > fit.minLabelSize) size--;
  // 2. Shrink until the label, the gap and the value fit the height.
  while (size + fit.gap + valueSize(size) > availableHeight && size > fit.minLabelSize) size--;
  // 3. Hide what still does not fit; a complex treemap kept a too-wide label (clipped in v12).
  let text = name;
  if (size < fit.minLabelSize) return {};
  if (fit === M.complex) {
    if (availableHeight < fit.minLabelSize) return {};
    text = truncate(measurer, name, font(size), availableWidth);
    if (text === '') return {};
  } else if (textWidth(measurer, name, font(size)) > availableWidth || availableHeight < size)
    return {};

  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const label = placed(text, font(size), measurer, {
    ...centre,
    anchor: 'middle',
    baseline: 'middle',
  });
  if (!shows(frame, t.value)) return { label };

  const valueFont = font(valueSize(size));
  const top = box.height / 2 + size / 2 + fit.gap;
  const valueText = placed(frame.format(t.value), valueFont, measurer, {
    x: centre.x,
    y: box.y + top,
    anchor: 'middle',
    baseline: 'hanging',
  });
  const fits =
    valueText.box.width <= availableWidth &&
    top + valueFont.size <= box.height - M.leafValueBottomPad &&
    valueFont.size >= fit.minValueSize;
  return fits ? { label, valueText } : { label };
}

/**
 * The title (`:126-134`): middle-anchored at `(width / 2, 15)`, at `treemapTitleFontSize`
 * (v12's `.treemapTitle` rule, 14 px, D407), which the renderer draws it at.
 */
function titleOf(title: string, width: number, frame: Frame): TreemapText {
  return placed(
    decodeEntities(title),
    { family: frame.family, size: frame.titleSize, weight: NORMAL_WEIGHT },
    frame.measurer,
    { x: width / 2, y: frame.band / 2, anchor: 'middle', baseline: 'middle' }
  );
}

/**
 * d3's `scaleOrdinal` with an implicit domain: a key's slot is its first-lookup index mod n.
 * The first `reserved` keys keep their own slots and the rest cycle through the slots past
 * them, so the fills' slot 0 (`transparent`) stays the hidden root's (D612).
 */
class Ordinal {
  private readonly index = new Map<string, number>();
  constructor(
    private readonly n: number,
    private readonly reserved = 0
  ) {}
  slot(key: string): number {
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.index.size;
      this.index.set(key, i);
    }
    const r = this.reserved;
    return i < r ? i : r + ((i - r) % (this.n - r));
  }
}

/** The union of what is drawn. */
const Box = RectUnion;
