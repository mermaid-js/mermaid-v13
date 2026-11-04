/**
 * The sequence custom layout (spec #125 T3, `layoutKind: 'custom'`): `SequenceModel` in,
 * `SequenceLayout` out, without the graph engine. It follows v12's `sequenceRenderer.ts` draw
 * pass with the drawing taken out: every label is measured first, then the columns are placed,
 * then one pass computes the x geometry of messages, notes and fragments and a second moves
 * down the rows. Every length comes from the metrics table (D108).
 *
 * v12 bugs fixed on the way, each small: a participant box grows with a multi-line label; an
 * empty frame spans the columns; a frame reaches down past its last section title and holds its
 * tab, which is as wide as its keyword; the row after a created stick figure starts below the
 * figure; a `deactivate` with nothing open is ignored; a lifeline without a bottom box ends
 * where the bottom boxes would start.
 */
import type { SequenceModel } from '../model.ts';
import { Bounds } from './bounds.ts';
import {
  actorMargins,
  boxSizes,
  shownBoxes,
  measureColumns,
  placeColumns,
  type BoxGeom,
  type BoxSizes,
} from './columns.ts';
import {
  centerOf,
  envOf,
  placed,
  type Column,
  type Env,
  type SequenceLayoutContext,
} from './env.ts';
import { geometryOf } from './geometry.ts';
import { lifelineOffset, Rows } from './rows.ts';
import type { BoxLayout, ParticipantLayout, PlacedLabel, Rect, SequenceLayout } from './types.ts';

/** Lays out a sequence diagram in the context's units. */
export function layoutSequence(model: SequenceModel, ctx: SequenceLayoutContext): SequenceLayout {
  const base = envOf(ctx, model.participants);
  const env: Env = { ...base, columns: measureColumns(model, base) };
  const { m } = env;
  actorMargins(model, env);
  const sizes = boxSizes(model, env);

  const b = new Bounds(m.boxMargin);
  const shown = shownBoxes(model, env);
  if (shown.length > 0) {
    b.bump(m.boxMargin.y);
    if (shown.some((box) => box.label !== '')) b.bump(sizes.labelHeight);
  }
  const boxes = placeColumns(model, env, sizes, b);
  const rowHeight = [...env.columns.values()][0]?.height ?? m.height;
  b.bump(rowHeight);

  const rows = new Rows(env, geometryOf(model.statements, env), b);
  rows.statements(model.statements);

  // The bottom row: mirrored boxes, or where they would be; below the tail of any activation.
  const footer = Math.max(b.y + 2 * m.boxMargin.y, ...rows.activations.map((a) => a.y + a.height));
  if (env.mirror) {
    b.bump(footer - b.y);
    b.bump(rowHeight + m.boxMargin.y);
  }
  const participants = participantLayouts(env, footer);
  const boxLayouts = boxLayoutsOf(env, boxes, sizes, b);
  if (shown.length > 0) b.bump(m.boxMargin.y);

  const layout = {
    units: ctx.units.id,
    participants,
    boxes: boxLayouts,
    messages: rows.messages,
    activations: rows.activations,
    notes: rows.notes,
    fragments: rows.fragments,
    rects: rows.rects,
  };
  const title = titleOf(env, model.title, b);
  const withTitle = title ? { ...layout, title: title.label } : layout;
  return { ...withTitle, bounds: enclose(viewBox(env, b, title?.band ?? 0), withTitle) };
}

function participantLayouts(env: Env, footer: number): ParticipantLayout[] {
  const { m } = env;
  const out: ParticipantLayout[] = [];
  for (const c of env.columns.values()) {
    if (!c.visible) continue;
    const destroyed = c.stopy !== undefined;
    const stopy = c.stopy ?? footer;
    let y2 = footer;
    if (env.mirror) y2 = stopy;
    else if (destroyed) y2 = stopy + m.half(c.height);
    out.push({
      id: c.p.id,
      ast: c.p.ast,
      kind: c.p.kind,
      label: c.label,
      x: c.x,
      width: c.width,
      height: c.height,
      labelY: labelOffset(env, c),
      top: c.top,
      ...(env.mirror ? { bottom: stopy } : {}),
      lifeline: { x: centerOf(env, c), y1: c.top + lifelineOffset(env, c), y2 },
      created: c.p.createdBy !== undefined,
      destroyed,
    });
  }
  return out;
}

/** From the top of a participant's box to the centre of its label (v12 `svgDraw.js` rows). */
function labelOffset(env: Env, c: Column): number {
  const { m } = env;
  const row = c.p.kind === 'actor' && m.figureLabelHeight > 0 ? m.figureLabelHeight : c.height;
  return (m.symbolLabelTop[c.p.kind] ?? 0) + m.half(row);
}

/** v12 draws a box from its first member's margin to its last, down to the last row. */
function boxLayoutsOf(env: Env, boxes: BoxGeom[], sizes: BoxSizes, b: Bounds): BoxLayout[] {
  const { m } = env;
  return boxes.map(({ box, x, width }) => {
    const height = b.y;
    b.insert(x, 0, x + width, height);
    const pad = 2 * m.boxMargin.x;
    const y = -m.half(m.boxMargin.y);
    const text = sizes.labels.get(box);
    const labelY = m.boxTextMargin.y + m.half(sizes.labelHeight);
    return {
      ast: box.ast,
      ...(box.color !== undefined ? { color: box.color } : {}),
      participants: box.participants,
      x: x - pad,
      y,
      width: width + 2 * pad,
      height: height + m.boxMargin.y - y,
      ...(text && text.lines.length > 0
        ? { label: placed(text, x + m.half(width - text.width), labelY - m.half(text.height)) }
        : {}),
    };
  });
}

/** The diagram title, centred in a band above the drawing. */
function titleOf(
  env: Env,
  title: string | undefined,
  b: Bounds
): { label: PlacedLabel; band: number } | undefined {
  if (title === undefined || title === '') return undefined;
  const { m } = env;
  const text = env.measure(title, env.fonts.title, Infinity);
  const sx = b.data.startx ?? 0;
  const ex = b.data.stopx ?? 0;
  const top = (b.data.starty ?? 0) - m.diagramMarginY - m.titleBand;
  const label = placed(
    text,
    sx + m.half(ex - sx - text.width),
    top + m.half(m.titleBand - text.height)
  );
  return { label, band: m.titleBand };
}

/** v12's viewBox. */
function viewBox(env: Env, b: Bounds, band: number): Rect {
  const { m } = env;
  const sx = b.data.startx ?? 0;
  const ex = b.data.stopx ?? 0;
  const sy = b.data.starty ?? 0;
  const ey = b.data.stopy ?? 0;
  let height = ey - sy + 2 * m.diagramMarginY + band;
  if (env.mirror) height += m.bottomMarginAdj - m.boxMargin.y;
  return {
    x: sx - m.diagramMarginX,
    y: sy - m.diagramMarginY - band,
    width: ex - sx + 2 * m.diagramMarginX,
    height,
  };
}

/** `box` grown to hold every rectangle of the layout. */
function enclose(box: Rect, l: Omit<SequenceLayout, 'bounds'>): Rect {
  let x1 = box.x;
  let y1 = box.y;
  let x2 = box.x + box.width;
  let y2 = box.y + box.height;
  const add = (r: Rect | undefined): void => {
    if (!r) return;
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  };
  for (const p of l.participants) {
    add({ x: p.x, y: p.top, width: p.width, height: p.lifeline.y1 - p.top });
    // A symbol's label can hang below its box (a multi-line stick figure label).
    const label = (top: number): Rect => ({
      x: p.x,
      y: top + p.labelY - p.label.height / 2,
      width: p.width,
      height: p.label.height,
    });
    add(label(p.top));
    if (p.bottom !== undefined) {
      add({ x: p.x, y: p.bottom, width: p.width, height: p.height });
      add(label(p.bottom));
    }
    add({ x: p.lifeline.x, y: p.lifeline.y1, width: 0, height: p.lifeline.y2 - p.lifeline.y1 });
  }
  for (const msg of l.messages) {
    add(msg.label);
    const lo = Math.min(msg.startX, msg.stopX);
    const hi = Math.max(msg.startX, msg.stopX, msg.self?.right ?? msg.stopX);
    add({ x: lo, y: msg.y, width: hi - lo, height: (msg.self?.bottom ?? msg.y) - msg.y });
  }
  for (const r of [...l.boxes, ...l.notes, ...l.fragments, ...l.rects, ...l.activations]) add(r);
  for (const f of l.fragments) add(f.title);
  add(l.title);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
