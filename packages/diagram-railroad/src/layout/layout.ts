/**
 * The railroad custom layout (spec #526 T3, `layoutKind: 'custom'`): `RailroadModel` in,
 * `RailroadLayout` out. It is v12's `railroadRenderer.ts` with the drawing taken out (D514): each
 * expression is a box `width` wide with its track `up` from the top and `down` from the bottom,
 * built bottom-up as v12 built it, and every text is measured first through the injected
 * measurer at the resolved font (pitfall 16): the `railroad` section's `fontFamily`/`fontSize`
 * where set, else the theme's (D515). Lengths come from the checked config and the metrics table
 * (pitfall 13).
 *
 * D514's two fixes of v12, listed in MIGRATION.md:
 * - rule names are measured at the bold weight they are drawn in (v12 measured them at normal
 *   weight), so the start marker clears a bold name;
 * - a choice's nearest branch above and below the main line reaches at least `2 × arcRadius`
 *   (`2r`) from it. v12 drew a branch closer than `2r` with its vertical piece running backwards
 *   (overshooting arcs); that branch now moves out to `2r`, and every branch beyond it on that
 *   side moves with it, so the choice's main line is no longer at half its height. An optional's
 *   bypass and a repetition's loop sit `max(2r, verticalSeparation)` from the element (v12: `2r`).
 * With v12's defaults (`verticalSeparation` 8, `arcRadius` 10) and v12's measurements, only the
 * choices v12 overshot change.
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  decodeEntities,
  layoutLabel,
  markdownString,
  type FontKey,
  type MeasuredLabel,
  type Measurer,
} from '@mermaid-js/core/text';
import {
  railroadConfig,
  railroadConfigWarning,
  railroadSection,
  type RailroadLayoutConfig,
} from '../config.ts';
import type { RailroadModel, RailroadNode, RailroadRule, RailroadSpecial } from '../model.ts';
import { Box, shifted, Track, visitRule } from './geometry.ts';
import { drawnText, isBlankText, isFormatted, oneLine, plainText } from './text.ts';
import { BOLD_WEIGHT, NORMAL_WEIGHT, RAILROAD_METRICS, type RailroadMetrics } from './metrics.ts';
import type {
  PlacedText,
  RailroadExpressionLayout,
  RailroadLayout,
  RailroadRuleLayout,
  TrackPath,
} from './types.ts';

/**
 * What the layout reads from the render context; `warn` takes the one `RAILROAD_CONFIG_INVALID`
 * of an unusable colour or font (D515), where the section is checked. Under the cell profile
 * (`units.id` `cell`) it does not warn: text draws none of those values.
 */
export type RailroadLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn' | 'units'>>;

/**
 * A choice's main line and its branches' tops (`tops`, moved in place) from v12's stacking:
 * `side` is each branch's side of `centre` (-1 above, 0 on it, 1 below), `r` the arc radius.
 */
export type ChoiceGuard = (
  items: readonly { readonly up: number; readonly down: number }[],
  tops: number[],
  side: readonly number[],
  centre: number,
  r: number
) => number;

/**
 * What the text entry hands the layout to lay out in cells (#617, `../ascii.ts` and `cells.ts`),
 * so the SVG path carries none of it: the cell tables, the cell measurer, the main-line rule
 * and the rows a rule takes below its definition.
 */
export interface RailroadCellOptions {
  readonly lengths: RailroadLayoutConfig;
  readonly metrics: RailroadMetrics;
  readonly measurer: Measurer;
  readonly guard: ChoiceGuard;
  readonly ruleRoom: number;
}

/**
 * Lays out a railroad diagram in px, or in cells with `cells` (the text entry's): the same
 * algorithm on the cell tables, the `railroad` lengths unread.
 */
export function layoutRailroad(
  model: RailroadModel,
  ctx: RailroadLayoutContext,
  cells?: RailroadCellOptions
): RailroadLayout {
  const checked = railroadConfig(railroadSection(ctx));
  const invalid = cells || ctx.units?.id === 'cell' ? undefined : railroadConfigWarning(checked);
  if (invalid) ctx.warn?.(invalid);
  // In cells the preset's lengths replace the section's (which are px).
  const config = cells ? { ...checked, lengths: cells.lengths } : checked;
  const options = config.lengths;
  const m = cells?.metrics ?? RAILROAD_METRICS;
  const measurer = cells?.measurer ?? ctx.measurer;
  const units = cells ? 'cell' : 'px';
  const font = config.font;
  const text: FontKey = {
    family: font.family ?? ctx.theme.value('fontFamily'),
    size: font.size ?? ctx.theme.number('fontSize'),
    weight: NORMAL_WEIGHT,
  };
  const ruleName: FontKey = { ...text, weight: BOLD_WEIGHT };
  const fonts = { text, ruleName };

  if (model.rules.length === 0) {
    const canvas = { x: 0, y: 0, width: m.emptyWidth, height: m.emptyHeight };
    return { ...canvas, units, metrics: m, config, fonts, rules: [], bounds: canvas };
  }

  const place = new Placer(options, m, measurer, text, ruleName, cells ?? { guard: pxGuard });
  const rules: RailroadRuleLayout[] = [];
  let y = options.padding;
  let widest = 0;
  for (const rule of model.rules) {
    const r = place.rule(rule, y);
    rules.push(r);
    y += r.height + options.verticalSeparation;
    widest = Math.max(widest, r.width);
  }
  const width = widest + 2 * options.padding;
  const height = y + options.padding;

  const box = new Box().add({ x: 0, y: 0, width, height });
  const half = options.strokeWidth / 2;
  for (const r of rules) {
    visitRule(r, (d) => void box.add(d.stroked ? shifted(d.rect, 0, 0, half) : d.rect));
  }
  return { width, height, units, metrics: m, config, fonts, rules, bounds: box.rect() };
}

/** The size of a laid-out expression, before its parent places it. */
type Sized = Omit<RailroadExpressionLayout, 'x' | 'y'>;

/** Places `e` at (`x`, `y`) in its parent. */
const at = (e: Sized, x: number, y: number): RailroadExpressionLayout => ({ ...e, x, y });

const height = (e: Sized): number => e.up + e.down;

/** How far a branch's track may be from a choice's main line and count as on it: float noise. */
const ON_LINE = 1e-6;

/** -1 above the main line, 1 below, 0 on it (`d` is the track's y less the main line's). */
const onSide = (d: number): number => (Math.abs(d) <= ON_LINE ? 0 : Math.sign(d));

/**
 * D514 in px: the nearest branch above and below the main line reaches at least `2r` from it (a
 * closer one, and every branch beyond it on that side, moves out); a branch on the main line
 * sits exactly on it.
 */
const pxGuard: ChoiceGuard = (items, tops, side, centre, r) => {
  let nearAbove = Infinity;
  let nearBelow = Infinity;
  items.forEach((it, i) => {
    const d = Math.abs(tops[i]! + it.up - centre);
    if (side[i]! < 0) nearAbove = Math.min(nearAbove, d);
    else if (side[i]! > 0) nearBelow = Math.min(nearBelow, d);
  });
  const raise = nearAbove < 2 * r ? 2 * r - nearAbove : 0;
  const lower = nearBelow < 2 * r ? 2 * r - nearBelow : 0;
  const main = centre + raise;
  items.forEach((it, i) => {
    if (side[i] === 0) tops[i] = main - it.up;
    else if (side[i]! > 0) tops[i] = tops[i]! + raise + lower;
  });
  return main;
};

/** v12's `RailroadRenderer` with the drawing taken out: one measured box per expression. */
class Placer {
  private readonly widths = new Map<string, number>();
  private readonly lineHeight: number;

  constructor(
    private readonly o: RailroadLayoutConfig,
    private readonly m: RailroadMetrics,
    private readonly measurer: Measurer,
    private readonly font: FontKey,
    private readonly ruleFont: FontKey,
    /** The main-line rule, and the rows below a rule's definition in cells (px: `2 × padding`). */
    private readonly cells: Pick<RailroadCellOptions, 'guard'> & Partial<RailroadCellOptions>
  ) {
    this.lineHeight = measurer.metrics(font).lineHeight;
  }

  /** A text's width at the box font, measured once per string (v12's `textCache`). */
  private width(text: string): number {
    let w = this.widths.get(text);
    if (w === undefined) {
      w = this.measurer.width(text, this.font, 0);
      this.widths.set(text, w);
    }
    return w;
  }

  /** v12's `renderRule` (L535-604): the rule's parts in its own coordinates. */
  rule(rule: RailroadRule, y: number): RailroadRuleLayout {
    const { padding, markerRadius: mR } = this.o;
    const name = `${decodeEntities(rule.name)} =`;
    const nameWidth = this.measurer.width(name, this.ruleFont, 0);
    const markerX = nameWidth + this.m.nameGap;
    const defX = markerX + this.m.definitionGap;
    const def = this.expression(rule.definition);
    const baseline = Math.max(this.m.minBaseline, def.up);
    const defY = baseline - def.up;
    const defEnd = defX + def.width;
    const endX = defEnd + this.m.endGap;
    const { ascent, descent } = this.measurer.metrics(this.ruleFont);
    const label: PlacedText = {
      text: name,
      font: this.ruleFont,
      x: 0,
      y: baseline,
      anchor: 'start',
      box: { x: 0, y: baseline - ascent, width: nameWidth, height: ascent + descent },
    };
    return {
      name: rule.name,
      ast: rule.astId,
      origin: { x: 0, y },
      baseline,
      label,
      start: { cx: markerX, cy: baseline, r: mR },
      end: { cx: endX, cy: baseline, r: mR },
      definition: at(def, defX, defY),
      leadIn: Track.from(markerX + mR, baseline)
        .lineTo(defX, baseline)
        .done(),
      leadOut: Track.from(defEnd, baseline)
        .lineTo(endX - mR, baseline)
        .done(),
      width: endX + mR,
      height: Math.max(
        this.m.minRuleHeight,
        defY + height(def) + (this.cells.ruleRoom ?? 2 * padding)
      ),
    };
  }

  /** v12's `renderExpression` (L504-530). */
  expression(node: RailroadNode): Sized {
    switch (node.type) {
      case 'terminal':
        return this.leaf(node, node.value, this.m.terminalCornerRadius);
      case 'nonterminal':
        return this.leaf(node, node.name, 0);
      case 'special':
        return this.special(node);
      case 'sequence':
        return this.sequence(
          node,
          node.elements.map((e) => this.expression(e))
        );
      case 'choice':
        return this.choice(
          node,
          node.alternatives.map((a) => this.expression(a))
        );
      case 'optional':
        return this.optional(node, this.expression(node.element));
      case 'repetition':
        return this.repetition(node, this.expression(node.element), node.min === 0);
    }
  }

  /**
   * A terminal, nonterminal or special: its text padded on every side (L98-162, L473-499).
   * Entity codes in `written` are decoded (D563), so the box is sized for, and the SVG and the
   * text output draw, the characters.
   */
  private leaf(
    node: RailroadNode,
    written: string,
    cornerRadius: number,
    dash?: readonly [number, number],
    drawn?: { readonly text: string; readonly label?: MeasuredLabel }
  ): Sized {
    const text = drawn?.text ?? decodeEntities(written);
    const label = drawn?.label;
    const { padding } = this.o;
    const [tw, th] = label ? [label.width, label.height] : this.textSize(node, text);
    const width = tw + 2 * padding;
    const h = th + 2 * padding;
    return {
      kind: node.type,
      ast: node.astId,
      width,
      up: h / 2,
      down: h / 2,
      children: [],
      paths: [],
      pathsAfter: [],
      box: { x: 0, y: 0, width, height: h, cornerRadius, ...(dash ? { dash } : {}) },
      text: {
        text,
        font: this.font,
        x: width / 2,
        y: h / 2,
        anchor: 'middle',
        box: { x: width / 2 - tw / 2, y: h / 2 - th / 2, width: tw, height: th },
        ...(label ? { label } : {}),
      },
    };
  }

  /**
   * A one-line text's width and height. A terminal in px is measured as the SVG draws it (#774):
   * a blank one as nothing, so its box is the padding alone (v12's empty bbox). The text output
   * keeps its cell of room.
   */
  private textSize(node: RailroadNode, text: string): [number, number] {
    const literal = node.type === 'terminal' && this.cells.measurer === undefined;
    if (literal && isBlankText(text)) return [0, 0];
    return [this.width(literal ? drawnText(text) : text), this.lineHeight];
  }

  /**
   * A special, `? text ?` in a dashed box (L473-499). Its text follows the label rule (D710):
   * `<br>`, the drawn tags and character references, and Markdown only in a markdown string.
   * A text that draws formatting is laid out in lines and its box sized from them (in px; the
   * text output draws its plain text). Any other is drawn as one string, as before: its
   * entities decoded, a markdown string without its backticks. The SVG draws a special on one
   * line, so a line break or tab written in it is a space.
   */
  private special(node: RailroadSpecial): Sized {
    const { text: source, markup } = markdownString(node.text);
    const written = `? ${source} ?`;
    const label = layoutLabel(oneLine(written), this.font, Infinity, this.measurer, { markup });
    const dash = this.m.specialDash;
    if (isFormatted(label)) {
      const text = plainText(label);
      return this.leaf(node, written, 0, dash, this.cells.measurer ? { text } : { text, label });
    }
    const text = markup === 'plain' ? decodeEntities(written) : plainText(label);
    return this.leaf(node, written, 0, dash, { text });
  }

  /** Elements in a row on one track, `horizontalSeparation` apart (L167-217). */
  private sequence(node: RailroadNode, items: Sized[]): Sized {
    const hs = this.o.horizontalSeparation;
    let up = 0;
    let down = 0;
    let width = Math.max(0, items.length - 1) * hs;
    for (const r of items) {
      width += r.width;
      up = Math.max(up, r.up);
      down = Math.max(down, r.down);
    }
    const children: RailroadExpressionLayout[] = [];
    const paths: TrackPath[] = [];
    let x = 0;
    items.forEach((r, i) => {
      children.push(at(r, x, up - r.up));
      if (i < items.length - 1) {
        paths.push(
          Track.from(x + r.width, up)
            .lineTo(x + r.width + hs, up)
            .done()
        );
      }
      x += r.width + hs;
    });
    const pathsAfter = items.map((_, i) => (i < items.length - 1 ? 1 : 0));
    return { kind: node.type, ast: node.astId, width, up, down, children, paths, pathsAfter };
  }

  /**
   * Branches stacked `verticalSeparation` apart and centred across `maxWidth + 4r`, the main
   * line at half the height (L222-313); D514 moves branches closer than `2r` to the main line out
   * to `2r`.
   */
  private choice(node: RailroadNode, items: Sized[]): Sized {
    const { verticalSeparation: vs, arcRadius: r } = this.o;
    let maxWidth = 0;
    let total = Math.max(0, items.length - 1) * vs;
    for (const it of items) {
      maxWidth = Math.max(maxWidth, it.width);
      total += height(it);
    }
    const width = maxWidth + 4 * r;
    let centre = total / 2;

    // v12's stacking: each branch's top and its track's y.
    const tops: number[] = [];
    let y = 0;
    for (const it of items) {
      tops.push(y);
      y += height(it) + vs;
    }
    const track = (i: number): number => tops[i]! + items[i]!.up;

    // `side` is v12's test (`elemCenterY === centerY`, `> centerY`), made before any move, with
    // a tolerance: measured sizes leave rounding noise, which must not move a branch v12 drew
    // on the main line out by 2r.
    const side = items.map((_, i) => onSide(track(i) - centre));
    centre = this.cells.guard(items, tops, side, centre, r);
    let bottom = 0;
    items.forEach((it, i) => void (bottom = Math.max(bottom, tops[i]! + height(it))));

    const children: RailroadExpressionLayout[] = [];
    const paths: TrackPath[] = [];
    items.forEach((it, i) => {
      const top = tops[i]!;
      const ty = top + it.up;
      const x = 2 * r + (maxWidth - it.width) / 2;
      children.push(at(it, x, top));
      const exit = x + it.width;
      if (side[i] === 0) {
        paths.push(Track.from(0, centre).lineTo(x, ty).done());
        paths.push(Track.from(exit, ty).lineTo(width, centre).done());
        return;
      }
      const below = side[i]! > 0;
      const toward = below ? r : -r;
      paths.push(
        Track.from(0, centre)
          .arcTo(r, below, r, centre + toward)
          .lineTo(r, ty - toward)
          .arcTo(r, !below, 2 * r, ty)
          .lineTo(x, ty)
          .done()
      );
      paths.push(
        Track.from(exit, ty)
          .lineTo(width - 2 * r, ty)
          .arcTo(r, !below, width - r, ty - toward)
          .lineTo(width - r, centre + toward)
          .arcTo(r, below, width, centre)
          .done()
      );
    });
    return {
      kind: node.type,
      ast: node.astId,
      width,
      up: centre,
      down: bottom - centre,
      children,
      paths,
      // Each branch's left and right paths.
      pathsAfter: items.map(() => paths.length / items.length),
    };
  }

  /**
   * The gap between an element and a bypass above it or a loop below it: v12's `2r`, or more
   * when `verticalSeparation` is larger (D514: `max(2r, verticalSeparation)`).
   */
  private gap(): number {
    return Math.max(2 * this.o.arcRadius, this.o.verticalSeparation);
  }

  /** The bypass above an element, from (0, `track`) to (`width`, `track`) over y 0 (L345-353). */
  private bypass(width: number, track: number): TrackPath {
    const r = this.o.arcRadius;
    return Track.from(0, track)
      .arcTo(r, false, r, track - r)
      .lineTo(r, r)
      .arcTo(r, true, 2 * r, 0)
      .lineTo(width - 2 * r, 0)
      .arcTo(r, true, width - r, r)
      .lineTo(width - r, track - r)
      .arcTo(r, false, width, track)
      .done();
  }

  /** The stubs from the box's edges to an element `2r` in from each side (L336-342). */
  private stubs(width: number, inner: Sized, track: number): TrackPath[] {
    const ex = 2 * this.o.arcRadius;
    return [
      Track.from(0, track).lineTo(ex, track).done(),
      Track.from(ex + inner.width, track)
        .lineTo(width, track)
        .done(),
    ];
  }

  /** The element on the track with a bypass above (L318-366). */
  private optional(node: RailroadNode, inner: Sized): Sized {
    const r = this.o.arcRadius;
    const width = inner.width + 4 * r;
    const top = this.gap();
    const track = top + inner.up;
    return {
      kind: node.type,
      ast: node.astId,
      width,
      up: track,
      down: inner.down,
      children: [at(inner, 2 * r, top)],
      paths: [...this.stubs(width, inner, track), this.bypass(width, track)],
      pathsAfter: [0],
    };
  }

  /** The element on the track, a loop back below it, and with `min` 0 a bypass above (L371-468). */
  private repetition(node: RailroadNode, inner: Sized, skippable: boolean): Sized {
    const r = this.o.arcRadius;
    const width = inner.width + 4 * r;
    const top = skippable ? this.gap() : 0;
    const track = top + inner.up;
    const ex = 2 * r;
    const exit = ex + inner.width;
    // The loop's lower line runs `gap` below the element (v12: `loopY + r`, `loopY = h + r`).
    const loop = top + height(inner) + this.gap() - r;
    const back = Track.from(exit, track)
      .arcTo(r, true, exit + r, track + r)
      .lineTo(exit + r, loop)
      .arcTo(r, true, exit, loop + r)
      .lineTo(ex, loop + r)
      .arcTo(r, true, r, loop)
      .lineTo(r, track + r)
      .arcTo(r, true, ex, track)
      .done();
    return {
      kind: node.type,
      ast: node.astId,
      width,
      up: track,
      down: loop + r - track,
      children: [at(inner, ex, top)],
      paths: [
        ...this.stubs(width, inner, track),
        back,
        ...(skippable ? [this.bypass(width, track)] : []),
      ],
      pathsAfter: [0],
    };
  }
}
