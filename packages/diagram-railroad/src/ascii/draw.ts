// cspell:words nonterminals
// Draws a railroad layout laid out in cells (`layout.units` `cell`, D518) on the text grid: each
// primitive in the cells it passes through, a point being a cell's centre. Track is drawn as
// arms (core's `armOf`): a line gives each cell it crosses its two arms and each end one arm
// towards the other, a quarter circle its corner cell two arms and each end one, so where tracks
// meet the arms join (`┬`, `┴`, `├`, `┤`, `┼`) and a lone corner is a rounded one (`╭╮╰╯`). Boxes
// are drawn first: the track's arm on a border makes the tee where it enters and leaves.
// Terminals have rounded corners (`/` and `\` in the `ascii` charset, where core's rounded corner
// is `+`, so they stay apart from nonterminals), nonterminals square ones, specials a dotted
// frame; the markers are core's circle glyph.
import {
  armOf,
  Canvas,
  cellWidth,
  DOWN,
  drawBox,
  drawText,
  glyphFor,
  LEFT,
  RIGHT,
  UP,
  type Dir,
  type GlyphSet,
  type Stroke,
} from '@mermaid-js/core/ascii';
import { cellText } from '../layout/cells.ts';
import type {
  Point,
  RailroadExpressionLayout,
  RailroadLayout,
  RailroadRuleLayout,
  TrackPath,
} from '../layout/types.ts';

/** A light arm (core's arm weights: 1 light). */
const LIGHT = 1;

/** The four lone corners, by their arms: the ones a quarter circle draws rounded. */
const CORNERS: readonly (readonly [number, keyof Stroke])[] = [
  [armOf(RIGHT, LIGHT) | armOf(DOWN, LIGHT), 'tl'],
  [armOf(LEFT, LIGHT) | armOf(DOWN, LIGHT), 'tr'],
  [armOf(UP, LIGHT) | armOf(RIGHT, LIGHT), 'bl'],
  [armOf(UP, LIGHT) | armOf(LEFT, LIGHT), 'br'],
];

/** A terminal's corners in the `ascii` charset. */
const ASCII_TERMINAL = { tl: '/', tr: '\\', bl: '\\', br: '/' } as const;

/** The arms of the track, by cell, and the cells a corner of track turns in. */
class Track {
  private readonly arms = new Map<string, { x: number; y: number; arms: number }>();
  private readonly turns = new Set<string>();

  add(x: number, y: number, d: Dir): void {
    const key = `${x},${y}`;
    const cell = this.arms.get(key);
    if (cell) cell.arms |= armOf(d, LIGHT);
    else this.arms.set(key, { x, y, arms: armOf(d, LIGHT) });
  }

  turn(x: number, y: number): void {
    this.turns.add(`${x},${y}`);
  }

  /** Draws the arms over what is on `canvas` (box borders become tees). */
  paint(canvas: Canvas, glyphs: GlyphSet): void {
    for (const [key, { x, y, arms }] of this.arms) {
      const corner = this.turns.has(key) ? CORNERS.find(([a]) => a === arms)?.[1] : undefined;
      const glyph = corner ? glyphs.rounded[corner] : glyphFor(arms, glyphs);
      if (glyph) canvas.draw(x, y, glyph);
    }
  }
}

/** The direction from cell `a` to cell `b` on one row or column. */
function towards(ax: number, ay: number, bx: number, by: number): Dir {
  if (ay === by) return bx > ax ? RIGHT : LEFT;
  return by > ay ? DOWN : UP;
}

/** A straight piece from `a` to `b` (cells, on one row or column). */
function line(track: Track, ax: number, ay: number, bx: number, by: number): void {
  if (ax === bx && ay === by) return;
  const d = towards(ax, ay, bx, by);
  const back = towards(bx, by, ax, ay);
  const steps = Math.abs(bx - ax) + Math.abs(by - ay);
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  for (let i = 0; i <= steps; i++) {
    const x = ax + i * dx;
    const y = ay + i * dy;
    if (i < steps) track.add(x, y, d);
    if (i > 0) track.add(x, y, back);
  }
}

/** One cell: a point's column and row, `dy` rows up (the top padding). */
const cell = (p: Point, dy: number): [number, number] => [Math.floor(p.x), Math.floor(p.y - dy)];

/**
 * A quarter circle from `p` to `q`, clockwise when `sweep`: its centre is the corner of the
 * square `p`/`q` span it bends around, and the track turns in the opposite corner.
 */
function arc(track: Track, p: Point, q: Point, sweep: boolean, dy: number): void {
  // Of (p.x, q.y) and (q.x, p.y), the centre is the one `p` turns around to `q` in the sweep's
  // direction (y down: clockwise is a positive cross product).
  const cross = (c: Point): number => (p.x - c.x) * (q.y - c.y) - (p.y - c.y) * (q.x - c.x);
  const first = { x: p.x, y: q.y };
  const corner = cross(first) > 0 === sweep ? { x: q.x, y: p.y } : first;
  const [px, py] = cell(p, dy);
  const [qx, qy] = cell(q, dy);
  const [cx, cy] = cell(corner, dy);
  line(track, px, py, cx, cy);
  line(track, cx, cy, qx, qy);
  track.turn(cx, cy);
}

/** A path at (`ox`, `oy`) in the diagram. */
function path(track: Track, p: TrackPath, ox: number, oy: number, dy: number): void {
  let from = { x: p.start.x + ox, y: p.start.y + oy };
  for (const s of p.segments) {
    const to = { x: s.x + ox, y: s.y + oy };
    if (s.kind === 'arc') arc(track, from, to, s.sweep, dy);
    else line(track, ...cell(from, dy), ...cell(to, dy));
    from = to;
  }
}

/** A frame in `stroke`, merging with what is drawn. */
function frame(canvas: Canvas, stroke: Stroke, x0: number, y0: number, x1: number, y1: number) {
  for (let x = x0 + 1; x < x1; x++) {
    canvas.draw(x, y0, stroke.h);
    canvas.draw(x, y1, stroke.h);
  }
  for (let y = y0 + 1; y < y1; y++) {
    canvas.draw(x0, y, stroke.v);
    canvas.draw(x1, y, stroke.v);
  }
  canvas.draw(x0, y0, stroke.tl);
  canvas.draw(x1, y0, stroke.tr);
  canvas.draw(x0, y1, stroke.bl);
  canvas.draw(x1, y1, stroke.br);
}

/** A terminal's, nonterminal's or special's box and text at (`ox`, `oy`). */
function leaf(
  canvas: Canvas,
  glyphs: GlyphSet,
  e: RailroadExpressionLayout,
  ox: number,
  oy: number,
  dy: number
): void {
  const box = e.box!;
  const [x0, y0] = cell({ x: ox + box.x, y: oy + box.y }, dy);
  const [x1, y1] = cell({ x: ox + box.x + box.width, y: oy + box.y + box.height }, dy);
  const rect = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  if (e.kind === 'special') frame(canvas, glyphs.dotted, x0, y0, x1, y1);
  else if (e.kind === 'nonterminal' || glyphs.name === 'unicode')
    drawBox(canvas, glyphs, rect, { form: e.kind === 'terminal' ? 'rounded' : 'square' });
  else frame(canvas, { ...glyphs.solid, ...ASCII_TERMINAL }, x0, y0, x1, y1);
  if (!e.text) return;
  const text = cellText(e.text.text);
  const [, row] = cell({ x: 0, y: oy + e.text.y }, dy);
  const inner = rect.width - 2;
  drawText(canvas, x0 + 1 + Math.max(0, Math.floor((inner - cellWidth(text)) / 2)), row, text);
}

/** One rule: its expressions, lead lines, name and markers. */
function rule(canvas: Canvas, track: Track, glyphs: GlyphSet, r: RailroadRuleLayout, dy: number) {
  const { x: rx, y: ry } = r.origin;
  const walk = (e: RailroadExpressionLayout, ox: number, oy: number): void => {
    if (e.box) leaf(canvas, glyphs, e, ox, oy, dy);
    for (const p of e.paths) path(track, p, ox, oy, dy);
    for (const c of e.children) walk(c, ox + c.x, oy + c.y);
  };
  walk(r.definition, rx + r.definition.x, ry + r.definition.y);
  path(track, r.leadIn, rx, ry, dy);
  path(track, r.leadOut, rx, ry, dy);
}

/** The text of `layout` (in cells), with `glyphs`. */
export function drawRailroad(layout: RailroadLayout, glyphs: GlyphSet): string {
  const canvas = new Canvas();
  const track = new Track();
  // The diagram's top padding is no row of text: the first rule starts on the first line.
  const dy = layout.rules[0]?.origin.y ?? 0;
  for (const r of layout.rules) rule(canvas, track, glyphs, r, dy);
  track.paint(canvas, glyphs);
  for (const r of layout.rules) {
    const { x: rx, y: ry } = r.origin;
    const [nx, ny] = cell({ x: rx + r.label.x, y: ry + r.label.y }, dy);
    drawText(canvas, nx, ny, cellText(r.label.text));
    for (const m of [r.start, r.end]) {
      const [mx, my] = cell({ x: rx + m.cx, y: ry + m.cy }, dy);
      canvas.set(mx, my, glyphs.circle);
    }
  }
  return canvas.toString();
}
