// Participant symbols, one factory per kind, drawn in the participant's box as v12
// `svgDraw.js` draws them in classic geometry (`drawActorType*`). Lengths here are v12's
// renderer constants; the box itself (x, top, width, height) is the layout's.
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
}

/** v12's figure lines and circles take its `line` / `.actor-man circle` CSS width. */
const FIGURE_STROKE = 2;
const STACK_OFFSET = 6;
const FIGURE_RADIUS = 22;
/** The stick figure (v12 `ACTOR_GLYPH_*`, `ACTOR_TYPE_WIDTH`). */
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
  const rect = { ...boxAttrs(s), width: p.width, height: p.height };
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
  const h = third;
  const x0 = p.x + third;
  const x1 = x0 + third;
  const top = y + 2 * ry;
  const d = w
    .path()
    .moveTo(x0, top)
    .arcTo(rx, ry, 0, false, false, x1, top)
    .arcTo(rx, ry, 0, false, false, x0, top)
    .lineTo(x0, y + h)
    .arcTo(rx, ry, 0, false, false, x1, y + h)
    .lineTo(x1, top)
    .done();
  w.leaf('path', { ...boxAttrs(s), d, filter: s.shadow });
}

function actor(s: SymbolScene): void {
  const { p, y, w } = s;
  const cx = p.x + p.width / 2;
  // v12 draws the stick figure without a shadow.
  w.open('g', { ...figureAttrs(s), filter: undefined });
  w.leaf('line', { x1: cx, y1: y + STICK.neck, x2: cx, y2: y + STICK.hip });
  w.leaf('line', {
    x1: cx - STICK.halfSpan,
    y1: y + STICK.arms,
    x2: cx + STICK.halfSpan,
    y2: y + STICK.arms,
  });
  w.leaf('line', { x1: cx - STICK.halfSpan, y1: y + STICK.feet, x2: cx, y2: y + STICK.hip });
  w.leaf('line', { x1: cx, y1: y + STICK.hip, x2: cx + STICK.rightFoot, y2: y + STICK.feet });
  w.leaf('circle', { cx, cy: y + STICK.head, r: STICK.headRadius });
  w.close();
}

function control(s: SymbolScene): void {
  const { p, y, w } = s;
  const cx = p.x + p.width / 2;
  const cy = y + CONTROL_CY;
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
  const { p, y, w } = s;
  const cx = p.x + p.width / 2;
  const cy = y + ENTITY_CY;
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
  const { p, y, w } = s;
  const cx = p.x + p.width / 2;
  const cy = y + BOUNDARY_CY;
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

/**
 * One participant symbol and its label, as a group classed like v12's (`actor-top` /
 * `actor-bottom`, `actor-man` for figures). The label carries `data-id` only.
 */
export function drawSymbol(s: SymbolScene, position: 'top' | 'bottom'): void {
  const { p, w } = s;
  const figure = FIGURES.has(p.kind);
  w.open('g', {
    class: `${figure ? 'actor-man ' : ''}actor-${position}`,
    'data-id': p.id,
  });
  SYMBOLS[p.kind](s);
  const dx = p.kind === 'collections' ? -STACK_OFFSET : 0;
  w.label(p.label, p.x + dx + p.width / 2, s.y + p.labelY, {
    class: `actor ${figure ? 'actor-man' : 'actor-box'}`,
    'data-id': p.id,
    fill: s.paint.text,
  });
  w.close();
}
