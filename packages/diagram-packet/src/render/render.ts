// Draws a laid-out packet diagram through the SvgWriter (spec #421 T4, DESIGN §7). The layout
// (`layoutPacket`) placed everything; this file only paints it, in v12's order: one `g` per row
// holding, per piece, `rect.packetBlock`, `text.packetLabel` and the `text.packetByte start` /
// `end` bit numbers, then `text.packetTitle` when there is a title. v12's class names are kept.
// A field's first piece carries its `data-ast`; every piece's rect carries `data-id`, the
// field's `<start>-<end>` (D345, pitfall 12).
//
// What every piece shares is written once on the root as an inherited presentation attribute:
// the stroke width (text has no stroke, so it ignores it), the bit numbers' font size and the
// labels' colour. Each element writes only what differs, so a one-piece row is about 430
// characters. The 10,000-row cap (about 4.3 MB) still exceeds the default `maxOutputLength`
// (4,000,000), so at the default limits it is a `LIMIT` error (GAPS, for the maintainer).
import type { RenderContext } from '@mermaid-js/core';
import { px, styleScope, styleText, themeStyleSheet } from '@mermaid-js/core/svg';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { PacketLayout, PacketPieceLayout, PlacedLabel } from '../layout/index.ts';
import type { PacketModel } from '../model.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type PacketRenderContext = Pick<RenderContext, 'config' | 'theme' | 'idPrefix' | 'version'>;

/** What drawing a piece needs, besides the piece. */
interface Parts {
  readonly model: PacketModel;
  readonly paint: Paints;
  readonly w: SvgWriter;
}

/** Writes the whole `<svg>` document for a laid-out packet diagram. */
export function renderPacket(
  model: PacketModel,
  layout: PacketLayout,
  ctx: PacketRenderContext,
  w: SvgWriter
): void {
  const title = layout.title;
  const paint = paints(ctx.theme, title !== undefined);
  openRoot(model, layout, ctx, paint, w);
  const parts: Parts = { model, paint, w };
  for (const row of layout.rows) {
    w.open('g');
    for (const p of row.pieces) drawPiece(parts, p);
    w.close();
  }
  // The title box is the layout's: its first line on v12's point, further lines below (D344).
  if (title)
    w.label(title.text, centreX(title), centreY(title), {
      class: 'packetTitle',
      fill: paint.title,
      'font-size': title.font.size,
    });
  w.close();
}

const centreX = (r: PlacedLabel): number => r.x + r.width / 2;
const centreY = (r: PlacedLabel): number => r.y + r.height / 2;

function drawPiece({ model, paint, w }: Parts, p: PacketPieceLayout): void {
  const field = model.fields[p.field]!;
  w.leaf('rect', {
    class: 'packetBlock',
    'data-id': `${field.start}-${field.end}`,
    'data-ast': p.first ? p.ast : undefined,
    ...p.box,
    fill: paint.blockFill,
    stroke: paint.blockStroke,
  });
  // The label's colour is the root's; its size is its own (a shrunk label's, D343).
  w.label(p.label.text, centreX(p.label), centreY(p.label), {
    class: 'packetLabel',
    'font-size': p.label.font.size,
  });
  // The bit numbers' size is the root's.
  for (const n of p.bitNumbers) {
    w.open('text', {
      class: `packetByte ${n.role}`,
      x: n.x,
      y: n.y,
      'text-anchor': n.anchor,
      fill: n.role === 'start' ? paint.startByte : paint.endByte,
    });
    w.text(n.text);
    w.close();
  }
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(
  model: PacketModel,
  layout: PacketLayout,
  ctx: PacketRenderContext,
  paint: Paints,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = config.packet?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-packet',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'packet',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
    // Inherited by every piece.
    fill: paint.label,
    'font-size': layout.fonts.byte.size,
    'stroke-width': layout.strokeWidth,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id: string): void {
  w.open(tag, { id });
  w.text(text);
  w.close();
}
