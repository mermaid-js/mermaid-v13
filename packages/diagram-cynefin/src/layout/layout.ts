/**
 * The cynefin custom layout (spec #423 T3, `layoutKind: 'custom'`): `CynefinModel` in,
 * `CynefinLayout` out. It follows v12's `cynefinRenderer.ts` with the drawing taken out, on
 * v12's fixed canvas (D361): quadrants, the ellipse, the seeded boundaries, the fixed texts,
 * the item badges, the transitions and the title, each text measured first through the
 * injected measurer (pitfall 16). The bounds start from v12's viewBox and grow wherever v12
 * clipped. Every length comes from the metrics table (pitfall 13).
 *
 * v12 bugs fixed on the way: invalid config falls back (D366), so no NaN reaches the output;
 * the `label.length * 7` width fallback is gone, since v13 always measures.
 */
import type { RenderContext } from '@mermaid-js/core';
import { layoutLabel, Style, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { CynefinDomain, CynefinDomainName, CynefinModel } from '../model.ts';
import { cynefinThemeLengths, type CynefinThemeLengths } from '../theme/lengths.ts';
import { cliffCurve, confusionEllipse, foldCurve, horizonCurve } from './boundaries.ts';
import { cynefinOptions, type CynefinOptions } from './config.ts';
import { Box, cubicBox, grow, pointsBox, quadBox } from './geometry.ts';
import { DOMAIN_META, domainTitle } from './meta.ts';
import { ARROWS, FONTS, ITEMS, LABELS, TITLE } from './metrics.ts';
import { resolveSeed } from './random.ts';
import type {
  CynefinEllipse,
  CynefinFont,
  CynefinFixedText,
  CynefinItemBadge,
  CynefinLayout,
  CynefinOverflowBadge,
  CynefinQuadrant,
  CynefinQuadrantName,
  CynefinTransitionLayout,
  PlacedLabel,
  Point,
} from './types.ts';

/** What the layout reads from the render context. */
export type CynefinLayoutContext = Pick<
  RenderContext,
  'config' | 'measurer' | 'theme' | 'idPrefix' | 'warn'
> &
  Partial<Pick<RenderContext, 'inline'>>;

/** v12's drawing order of the quadrants (:119), and of every domain's items (:233). */
const QUADRANTS: readonly CynefinQuadrantName[] = ['complex', 'complicated', 'chaotic', 'clear'];
const DOMAINS: readonly CynefinDomainName[] = [...QUADRANTS, 'confusion'];

type Fonts = CynefinLayout['fonts'];

/** What every step reads: the options, the fonts and the two ways a text is measured. */
interface Env {
  readonly o: CynefinOptions;
  readonly fonts: Fonts;
  /** A fixed text (D363): a plain constant, no markup to read, no extension spans. */
  plain(text: string, font: CynefinFont): MeasuredLabel;
  /** Author text through core's label layout, unwrapped as v12 drew it (D363). */
  rich(text: string, font: CynefinFont): MeasuredLabel;
}

/** The canvas's domains: four quadrants and the ellipse, with their AST ids when declared. */
interface Canvas {
  readonly quadrants: readonly CynefinQuadrant[];
  readonly confusion: CynefinEllipse;
  centre(name: CynefinDomainName): Point;
}

/** Lays out a cynefin diagram in px. */
export function layoutCynefin(model: CynefinModel, ctx: CynefinLayoutContext): CynefinLayout {
  const section = ctx.config.cynefin as Readonly<Record<string, unknown>> | undefined;
  const o = cynefinOptions(section, (w) => ctx.warn(w));
  const lengths = cynefinThemeLengths(ctx.theme);
  const env = environment(o, lengths, ctx);
  const declared = new Map<CynefinDomainName, CynefinDomain>(model.domains.map((d) => [d.name, d]));

  const canvas = canvasOf(o, declared);
  const seed = resolveSeed(o.seed, ctx.idPrefix);
  const boundaries = {
    fold: foldCurve(o.width, o.height, seed, o.boundaryAmplitude),
    horizon: horizonCurve(o.width, o.height, seed, o.boundaryAmplitude),
    cliff: cliffCurve(o.width, o.height),
  };
  const { labels, subtitles } = fixedTexts(env, canvas);
  const { items, overflow } = badges(env, canvas, declared);
  const transitions = model.transitions.flatMap((t) => transition(env, canvas, t, lengths));
  const title = model.title ? titleOf(env, model.title) : undefined;
  const strokes = {
    boundary: lengths.boundaryWidth,
    cliff: lengths.cliffWidth,
    arrow: lengths.arrowWidth,
    item: ITEMS.strokeWidth,
  };

  const drawn: Omit<CynefinLayout, 'bounds' | 'viewBox'> = {
    width: o.width,
    height: o.height,
    padding: o.padding,
    offset: { x: o.padding, y: o.padding },
    showDomainDescriptions: o.showDomainDescriptions,
    seed,
    quadrants: canvas.quadrants,
    confusion: canvas.confusion,
    boundaries,
    strokes,
    labels,
    subtitles,
    items,
    ...(overflow ? { overflow } : {}),
    transitions,
    ...(title ? { title } : {}),
    fonts: env.fonts,
  };
  const bounds = boundsOf(drawn);
  return {
    ...drawn,
    bounds,
    viewBox: { ...bounds, x: bounds.x + o.padding, y: bounds.y + o.padding },
  };
}

function environment(
  o: CynefinOptions,
  lengths: CynefinThemeLengths,
  ctx: CynefinLayoutContext
): Env {
  const family = ctx.theme.value('fontFamily');
  const font = (size: number, weight: number, style: CynefinFont['style'] = 'normal') => ({
    family,
    size,
    weight,
    style,
  });
  // The measurer gets core's key; an italic font starts every run italic.
  const key = (f: CynefinFont): FontKey => ({ family: f.family, size: f.size, weight: f.weight });
  const bits = (f: CynefinFont): number => (f.style === 'italic' ? Style.Italic : 0);
  const smaller = lengths.itemFontSize + FONTS.smallerDelta;
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  return {
    o,
    fonts: {
      label: font(lengths.domainFontSize, FONTS.bold),
      subtitle: font(smaller, FONTS.normal, 'italic'),
      item: font(lengths.itemFontSize, FONTS.normal),
      transition: font(smaller, FONTS.normal),
      title: font(lengths.domainFontSize + TITLE.sizeDelta, FONTS.bold),
    },
    plain: (text, f) => layoutLabel(text, key(f), Infinity, ctx.measurer, { style: bits(f) }),
    rich: (text, f) => {
      const md = markdownString(text);
      const style = bits(f);
      return md === undefined
        ? layoutLabel(text, key(f), Infinity, ctx.measurer, { ...inline, style })
        : layoutLabel(md, key(f), Infinity, ctx.measurer, { ...inline, markdown: true, style });
    },
  };
}

/** The canvas (:40-50, :158): four quadrants of half the size, centred on their quarter points. */
function canvasOf(
  o: CynefinOptions,
  declared: ReadonlyMap<CynefinDomainName, CynefinDomain>
): Canvas {
  const hw = o.width / 2;
  const hh = o.height / 2;
  const astOf = (name: CynefinDomainName): { ast?: string } => {
    const d = declared.get(name);
    return d ? { ast: d.ast } : {};
  };
  const corner: Readonly<Record<CynefinQuadrantName, Point>> = {
    complex: { x: 0, y: 0 },
    complicated: { x: hw, y: 0 },
    chaotic: { x: 0, y: hh },
    clear: { x: hw, y: hh },
  };
  const quadrants: CynefinQuadrant[] = QUADRANTS.map((name) => {
    const { x, y } = corner[name];
    return {
      name,
      x,
      y,
      width: hw,
      height: hh,
      center: { x: x + hw / 2, y: y + hh / 2 },
      ...astOf(name),
    };
  });
  const confusion = { ...confusionEllipse(o.width, o.height), ...astOf('confusion') };
  return {
    quadrants,
    confusion,
    centre: (name) =>
      name === 'confusion' ? confusion.center : quadrants[QUADRANTS.indexOf(name)]!.center,
  };
}

/** Domain names and subtitles (:168-225), centred on their anchors. */
function fixedTexts(
  env: Env,
  canvas: Canvas
): { labels: CynefinFixedText[]; subtitles: CynefinFixedText[] } {
  const desc = env.o.showDomainDescriptions;
  const fixed = (domain: CynefinDomainName, text: MeasuredLabel, x: number, y: number) => ({
    domain,
    ...centred(text, x, y),
  });
  const name = (d: CynefinDomainName): MeasuredLabel => env.plain(domainTitle(d), env.fonts.label);
  const sub = (text: string): MeasuredLabel => env.plain(text, env.fonts.subtitle);
  const { x: ex, y: ey } = canvas.confusion.center;

  const labels = canvas.quadrants.map(({ name: d, center: { x, y } }) =>
    fixed(d, name(d), x, y + (desc ? LABELS.quadrantLabelDy : 0))
  );
  labels.push(fixed('confusion', name('confusion'), ex, ey + (desc ? LABELS.confusionLabelDy : 0)));
  if (!desc) return { labels, subtitles: [] };

  const subtitles = canvas.quadrants.flatMap(({ name: d, center: { x, y } }) => [
    fixed(d, sub(DOMAIN_META[d].model), x, y + LABELS.modelDy),
    fixed(d, sub(DOMAIN_META[d].practice), x, y + LABELS.practiceDy),
  ]);
  subtitles.push(
    fixed('confusion', sub(DOMAIN_META.confusion.practice), ex, ey + LABELS.disorderDy)
  );
  return { labels, subtitles };
}

/** Where a domain's first badge starts, under its centre (:255-258). */
function firstBadgeTop(name: CynefinDomainName, desc: boolean): number {
  if (name === 'confusion') return desc ? ITEMS.confusionTop : ITEMS.confusionTopBare;
  return desc ? ITEMS.quadrantTop : ITEMS.quadrantTopBare;
}

/** Item badges (:229-348): centred on the domain, stepping down; confusion shows three. */
function badges(
  env: Env,
  canvas: Canvas,
  declared: ReadonlyMap<CynefinDomainName, CynefinDomain>
): { items: CynefinItemBadge[]; overflow?: CynefinOverflowBadge } {
  const items: CynefinItemBadge[] = [];
  let overflow: CynefinOverflowBadge | undefined;
  for (const name of DOMAINS) {
    const domain = declared.get(name);
    if (!domain || domain.items.length === 0) continue;
    const c = canvas.centre(name);
    const shown = name === 'confusion' ? domain.items.slice(0, ITEMS.maxConfusion) : domain.items;
    let top = c.y + firstBadgeTop(name, env.o.showDomainDescriptions);
    const badge = (text: MeasuredLabel) => {
      const width = text.width + ITEMS.paddingX * 2;
      // 26 px is a minimum that grows with the label's extra lines (D363).
      const height = ITEMS.height + extraLines(text);
      const box = { domain: name, x: c.x - width / 2, y: top, width, height };
      top += height + ITEMS.gap;
      return { ...box, label: centred(text, c.x, box.y + height / 2), radius: ITEMS.radius };
    };
    shown.forEach((item, index) => {
      items.push({
        ...badge(env.rich(item.label, env.fonts.item)),
        ast: item.ast,
        index,
        id: item.label,
      });
    });
    const count = domain.items.length - shown.length;
    if (count > 0) overflow = { ...badge(env.plain(`+${count} more`, env.fonts.item)), count };
  }
  return overflow ? { items, overflow } : { items };
}

/**
 * A transition (:350-419): a quadratic curve centre to centre, its control point the midpoint
 * plus the left normal times 0.15 of the length; none for a self-loop (the parser drops them,
 * D365, and v12's renderer skips any that remain).
 */
function transition(
  env: Env,
  canvas: Canvas,
  t: CynefinModel['transitions'][number],
  lengths: CynefinThemeLengths
): CynefinTransitionLayout[] {
  if (t.from === t.to) return [];
  const start = canvas.centre(t.from);
  const end = canvas.centre(t.to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // v12's `sqrt(dx² + dy²)`, without the overflow of the squares at a huge canvas.
  const len = Math.hypot(dx, dy);
  const bend = len * ARROWS.bend;
  const nx = len === 0 ? 0 : -dy / len;
  const ny = len === 0 ? 0 : dx / len;
  const control = {
    x: (start.x + end.x) / 2 + nx * bend,
    y: (start.y + end.y) / 2 + ny * bend,
  };
  const head = arrowhead(control, end, lengths.arrowWidth);
  const line = { from: t.from, to: t.to, ast: t.ast, start, control, end, head };
  if (!t.label) return [line];
  const text = env.rich(t.label, env.fonts.transition);
  // The last line's baseline 6 above the control point; more lines grow up.
  const y = control.y + ARROWS.labelDy - text.baseline - extraLines(text);
  const label = { x: control.x - text.width / 2, y, width: text.width, height: text.height, text };
  return [{ ...line, label }];
}

/** The title (:424-433): centred half the padding above the canvas; more lines grow up. */
function titleOf(env: Env, title: string): PlacedLabel {
  const text = env.rich(title, env.fonts.title);
  const lastLine = env.o.padding * TITLE.paddingShare;
  const y = lastLine + text.lineHeight / 2 - text.height;
  const x = env.o.width / 2 - text.width / 2;
  return { x, y, width: text.width, height: text.height, text };
}

/** v12's viewBox in content space, grown over everything drawn, strokes included (D361). */
function boundsOf(l: Omit<CynefinLayout, 'bounds' | 'viewBox'>): CynefinLayout['bounds'] {
  const { padding: p, strokes, confusion: e } = l;
  const box = new Box();
  box.add({ x: -p, y: -p, width: l.width + 2 * p, height: l.height + 2 * p });
  for (const q of l.quadrants) box.add(q);
  const ellipse = { x: e.center.x - e.rx, y: e.center.y - e.ry, width: 2 * e.rx, height: 2 * e.ry };
  box.add(grow(ellipse, e.strokeWidth / 2));
  box.add(grow(cubicBox(l.boundaries.fold), strokes.boundary / 2));
  box.add(grow(cubicBox(l.boundaries.horizon), strokes.boundary / 2));
  box.add(grow(cubicBox(l.boundaries.cliff), strokes.cliff / 2));
  for (const t of [...l.labels, ...l.subtitles]) box.add(t);
  for (const b of l.overflow ? [...l.items, l.overflow] : l.items) {
    box.add(grow(b, strokes.item / 2));
    box.add(b.label);
  }
  for (const t of l.transitions) {
    box.add(grow(quadBox(t.start, t.control, t.end), strokes.arrow / 2));
    box.add(pointsBox(t.head));
    if (t.label) box.add(t.label);
  }
  if (l.title) box.add(l.title);
  return box.rect();
}

/**
 * v12's marker (:356-367) as a triangle: the `M 0 0 L 10 5 L 0 10 z` head in a 10 × 10 box,
 * `markerWidth 6` stroke widths wide, its `refX 9, refY 5` point on the curve's end, oriented
 * along the end tangent (`orient: auto`). The line is not shortened.
 */
function arrowhead(
  control: Point,
  end: Point,
  strokeWidth: number
): readonly [Point, Point, Point] {
  const dx = end.x - control.x;
  const dy = end.y - control.y;
  const len = Math.hypot(dx, dy);
  const ux = len === 0 ? 1 : dx / len;
  const uy = len === 0 ? 0 : dy / len;
  const unit = (ARROWS.markerWidth * strokeWidth) / ARROWS.markerBox;
  const at = (mx: number, my: number): Point => {
    const along = (mx - ARROWS.markerRefX) * unit;
    const across = (my - ARROWS.markerRefY) * unit;
    return { x: end.x + along * ux - across * uy, y: end.y + along * uy + across * ux };
  };
  return [at(0, 0), at(ARROWS.markerBox, ARROWS.markerRefY), at(0, ARROWS.markerBox)];
}

/** A label centred on (`cx`, `cy`). */
function centred(text: MeasuredLabel, cx: number, cy: number): PlacedLabel {
  const { width, height } = text;
  return { x: cx - width / 2, y: cy - height / 2, width, height, text };
}

/** How much taller than one line a label is: 0 for one line, or none. */
function extraLines(text: MeasuredLabel): number {
  return Math.max(0, text.height - text.lineHeight);
}

/**
 * The source of a markdown string (D225): a label in backticks, as pie and flowchart read one.
 * The parser has removed the quotes.
 */
function markdownString(text: string): string | undefined {
  return RE_MARKDOWN.exec(text.trim())?.[1];
}
const RE_MARKDOWN = /^`([^]*)`$/;
