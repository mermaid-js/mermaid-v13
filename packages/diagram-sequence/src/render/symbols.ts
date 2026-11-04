// Participant symbols, one factory per kind, drawn in the participant's box as v12
// `svgDraw.js` draws them (`drawActorType*`): in classic geometry, or standing on the glyph
// band when the layout gives one (v12 neo's band model, theme `actorGlyphBand`, #194). Lengths
// here are v12's renderer constants; the box and the band are the layout's.
import type { Attrs, Paint, SvgWriter } from '@mermaid-js/core/svg';
import type { ParticipantKind } from '../model.ts';
import type { ParticipantLayout } from '../layout/index.ts';
import type { ActorPaint, Paints, Tint } from './paint.ts';
import { placePoints } from './arrows.ts';

/** What one symbol is drawn from. */
export interface SymbolScene {
  readonly w: SvgWriter;
  readonly p: ParticipantLayout;
  /** Top of the box this symbol is drawn in: the header or the mirrored footer. */
  readonly y: number;
  readonly paint: ActorPaint;
  readonly tint: Tint | undefined;
  readonly shadow: Paints['shadow'];
  /** The y of the glyph band's bottom edge for this box, under the band model. */
  readonly glyphBottom?: number;
}

/** v12's figure lines and circles take its `line` / `.actor-man circle` CSS width. */
const FIGURE_STROKE = 2;
const STACK_OFFSET = 6;
const FIGURE_RADIUS = 22;
/** The stick figure (v12 `ACTOR_GLYPH_*`, `ACTOR_TYPE_WIDTH`), unscaled from its classic top. */
const STICK = {
  head: 10,
  headRadius: 15,
  neck: 25,
  hip: 45,
  arms: 33,
  feet: 60,
  halfSpan: 18,
  /** The right leg ends 2 short of the arm span. */
  rightFoot: 16,
  /** v12 `ACTOR_GLYPH_HEIGHT`: head top (-5) to feet (60); scaled to the band under neo. */
  height: 65,
} as const;
const CONTROL_CY = 32;
const ENTITY_CY = 31;
const BOUNDARY_CY = 33;
const BOUNDARY_BAR = 2.5 * FIGURE_RADIUS;
const BOUNDARY_GAP = 15;
const BOUNDARY_TICK = 10;
// The control symbol's arrowhead (v12 `-filled-head-control` marker, on a 2px line).
const CONTROL_HEAD = {
  points: [
    [14.4, 5.6],
    [7.2, 10.4],
    [8.8, 5.6],
    [7.2, 0.8],
  ] as const,
  ref: [11, 5.8] as const,
  scale: FIGURE_STROKE,
  angle: (172.5 * Math.PI) / 180,
  /** The marker's 1.2, in its units. */
  strokeWidth: 1.2 * FIGURE_STROKE,
};

const fillOf = (s: SymbolScene): Paint => s.tint?.fill ?? s.paint.fill;
const strokeOf = (s: SymbolScene): Paint => s.tint?.stroke ?? s.paint.stroke;

/** The box kinds' outline paint. */
const boxAttrs = (s: SymbolScene): Attrs => ({
  class: 'actor',
  fill: fillOf(s),
  stroke: strokeOf(s),
  'stroke-width': s.paint.strokeWidth,
});

/** The figure kinds' group paint; lines and circles inherit it. */
const figureAttrs = (s: SymbolScene): Attrs => ({
  fill: fillOf(s),
  stroke: strokeOf(s),
  'stroke-width': FIGURE_STROKE,
  filter: s.shadow,
});

function participant(s: SymbolScene): void {
  const { p, y, w } = s;
  const r = s.paint.radius;
  w.leaf('rect', {
    ...boxAttrs(s),
    x: p.x,
    y,
    width: p.width,
    height: p.height,
    rx: r,
    ry: r,
    filter: s.shadow,
  });
}

function collections(s: SymbolScene): void {
  const { p, y, w } = s;
  w.open('g', { filter: s.shadow });
  // v12 neo draws both rects shorter, so the back one stops at the lifeline.
  const rect = { ...boxAttrs(s), width: p.width, height: p.height - (p.band?.inset ?? 0) };
  w.leaf('rect', { ...rect, x: p.x, y });
  w.leaf('rect', { ...rect, x: p.x - STACK_OFFSET, y: y + STACK_OFFSET });
  w.close();
}

function queue(s: SymbolScene): void {
  const { p, y, w } = s;
  const h = p.height;
  const ry = h / 2;
  const rx = ry / (2.5 + h / 50);
  const left = p.x + rx;
  const right = p.x + p.width - rx;
  const body = w
    .path()
    .moveTo(left, y)
    .arcTo(rx, ry, 0, false, false, left, y + h)
    .lineTo(right, y + h)
    .arcTo(rx, ry, 0, false, false, right, y)
    .close()
    .done();
  const cap = w
    .path()
    .moveTo(right, y)
    .arcTo(rx, ry, 0, false, false, right, y + h)
    .done();
  w.open('g', { ...boxAttrs(s), filter: s.shadow });
  w.leaf('path', { d: body });
  w.leaf('path', { d: cap });
  w.close();
}

function database(s: SymbolScene): void {
  const { p, y, w } = s;
  const third = p.width / 3;
  const rx = third / 2;
  const ry = rx / (2.5 + third / 50);
  // v12 neo: as tall as the band, its bottom on the band's edge; classic: width / 3 from the top.
  const h = p.band ? p.band.height : third;
  const y0 = s.glyphBottom !== undefined ? s.glyphBottom - h - ry : y;
  const x0 = p.x + third;
  const x1 = x0 + third;
  const top = y0 + 2 * ry;
  const d = w
    .path()
    .moveTo(x0, top)
    .arcTo(rx, ry, 0, false, false, x1, top)
    .arcTo(rx, ry, 0, false, false, x0, top)
    .lineTo(x0, y0 + h)
    .arcTo(rx, ry, 0, false, false, x1, y0 + h)
    .lineTo(x1, top)
    .done();
  w.leaf('path', { ...boxAttrs(s), d, filter: s.shadow });
}

function actor(s: SymbolScene): void {
  const { p, y, w } = s;
  const cx = p.x + p.width / 2;
  // v12 neo scales the figure to fill the band, feet on its bottom edge.
  const bottom = s.glyphBottom;
  const k = p.band && bottom !== undefined ? p.band.height / STICK.height : 1;
  const gy = (o: number): number => (bottom !== undefined ? bottom - (STICK.feet - o) * k : y + o);
  const gx = (o: number): number => cx + o * k;
  // v12 draws the stick figure without a shadow.
  w.open('g', { ...figureAttrs(s), filter: undefined });
  w.leaf('line', { x1: cx, y1: gy(STICK.neck), x2: cx, y2: gy(STICK.hip) });
  w.leaf('line', {
    x1: gx(-STICK.halfSpan),
    y1: gy(STICK.arms),
    x2: gx(STICK.halfSpan),
    y2: gy(STICK.arms),
  });
  w.leaf('line', { x1: gx(-STICK.halfSpan), y1: gy(STICK.feet), x2: cx, y2: gy(STICK.hip) });
  w.leaf('line', { x1: cx, y1: gy(STICK.hip), x2: gx(STICK.rightFoot), y2: gy(STICK.feet) });
  w.leaf('circle', { cx, cy: gy(STICK.head), r: STICK.headRadius * k });
  w.close();
}

/** A round glyph's centre: on the band, its circle touching the bottom edge; else classic. */
const roundCy = (s: SymbolScene, classic: number): number =>
  s.glyphBottom !== undefined ? s.glyphBottom - FIGURE_RADIUS : s.y + classic;

function control(s: SymbolScene): void {
  const { p, w } = s;
  const cx = p.x + p.width / 2;
  const cy = roundCy(s, CONTROL_CY);
  w.open('g', { ...figureAttrs(s), filter: undefined });
  w.leaf('circle', { cx, cy, r: FIGURE_RADIUS, filter: s.shadow });
  const h = CONTROL_HEAD;
  w.leaf('polygon', {
    points: placePoints(h.points, h.ref, h.scale, [cx, cy - FIGURE_RADIUS], h.angle),
    'stroke-width': h.strokeWidth,
  });
  w.close();
}

function entity(s: SymbolScene): void {
  const { p, w } = s;
  const cx = p.x + p.width / 2;
  const cy = roundCy(s, ENTITY_CY);
  w.open('g', figureAttrs(s));
  w.leaf('circle', { cx, cy, r: FIGURE_RADIUS });
  w.leaf('line', {
    x1: cx - FIGURE_RADIUS,
    y1: cy + FIGURE_RADIUS,
    x2: cx + FIGURE_RADIUS,
    y2: cy + FIGURE_RADIUS,
  });
  w.close();
}

function boundary(s: SymbolScene): void {
  const { p, w } = s;
  const cx = p.x + p.width / 2;
  const cy = roundCy(s, BOUNDARY_CY);
  w.open('g', figureAttrs(s));
  w.leaf('line', { x1: cx - BOUNDARY_BAR, y1: cy, x2: cx - BOUNDARY_GAP, y2: cy });
  w.leaf('line', {
    x1: cx - BOUNDARY_BAR,
    y1: cy - BOUNDARY_TICK,
    x2: cx - BOUNDARY_BAR,
    y2: cy + BOUNDARY_TICK,
  });
  w.leaf('circle', { cx, cy, r: FIGURE_RADIUS });
  w.close();
}

const SYMBOLS: Readonly<Record<ParticipantKind, (s: SymbolScene) => void>> = {
  participant,
  collections,
  queue,
  database,
  actor,
  control,
  entity,
  boundary,
};

/** Kinds drawn as a figure above their label (v12 `actor-man`), the rest as a box. */
const FIGURES: ReadonlySet<ParticipantKind> = new Set(['actor', 'control', 'entity', 'boundary']);
/** Kinds that stand on the glyph band under the band model (v12 `neoBands` callers). */
const GLYPHS: ReadonlySet<ParticipantKind> = new Set([...FIGURES, 'database']);

/**
 * One participant symbol and its label, as a group classed like v12's (`actor-top` /
 * `actor-bottom`, `actor-man` for figures). The label carries `data-id` only.
 */
export function drawSymbol(scene: SymbolScene, position: 'top' | 'bottom'): void {
  const { p, w } = scene;
  const figure = FIGURES.has(p.kind);
  const bottom = position === 'bottom';
  const s =
    p.band && GLYPHS.has(p.kind)
      ? { ...scene, glyphBottom: scene.y + (bottom ? p.band.bottom : p.band.top) }
      : scene;
  w.open('g', {
    class: `${figure ? 'actor-man ' : ''}actor-${position}`,
    'data-id': p.id,
  });
  SYMBOLS[p.kind](s);
  const dx = p.kind === 'collections' ? -STACK_OFFSET : 0;
  const labelY = bottom ? (p.bottomLabelY ?? p.labelY) : p.labelY;
  w.label(p.label, p.x + dx + p.width / 2, s.y + labelY, {
    class: `actor ${figure ? 'actor-man' : 'actor-box'}`,
    'data-id': p.id,
    fill: s.paint.text,
  });
  w.close();
}
