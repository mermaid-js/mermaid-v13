/**
 * The colours a c4-beta diagram is drawn with (spec #730): the paint table `drawScene` takes. Until
 * the theme ticket (T2) adds `c4<Kind>Color` rows, an element takes its legacy kind's palette from
 * the `c4` section (v12's colours), and boundaries, relations and the title the shared variables
 * `c4BoundaryColor`, `c4RelationColor` and `c4TitleColor`. Every theme colour is read before the
 * root is written, in drawing order, as `render/paint.ts` does.
 *
 * A `style` paints what it targets over those defaults. An item takes the statements for its kind
 * first, then those for each tag in the order it lists them, and a later key replaces an earlier
 * one (the prototype's order: a tag style is pushed after the kind's colours, and the last tag
 * wins). `fill` and `stroke` colour an element's body and outline (`stroke` is `fill` when only a
 * `fill` is given, as the legend's swatch shows it), `color` its text; a relation takes `stroke`
 * for its line and arrowheads, `color` for its text and `line` for its dash. Every colour goes
 * through the colour check and is written as an attribute, never into `style`.
 */
import type { Paint, SafeValue } from '@mermaid-js/core/svg';
import type {
  C4BoundaryLayout,
  C4Layout,
  C4LegendLayout,
  C4LegendRow,
  C4RelationLayout,
} from '../layout/types.ts';
import type { C4RenderContext } from '../render/context.ts';
import { C4_RENDER_METRICS as R } from '../render/metrics.ts';
import {
  Colours,
  colourWarning,
  ELEMENT_TEXT,
  kindPalette,
  type BoundaryPaint,
  type ElementPaint,
  type LegendPaint,
  type Paints,
  type RelationPaint,
} from '../render/paint.ts';
import { legacyKind } from './prepare.ts';
import type { C4BetaElement, C4BetaModel, C4BetaRelation, C4BetaStyle } from './model.ts';

/** The keys of a style that colour or dash what it targets. */
type PaintKey = 'fill' | 'stroke' | 'color' | 'line';

/** A key's value, with where it was written (for `C4_COLOR_INVALID`) and its AST id. */
interface Said {
  readonly value: string;
  readonly where: string;
  readonly ast: string;
}

/** What `style` statements say of one item, the last statement of a key winning. */
type Keys = Partial<Record<PaintKey, Said>>;

const PAINT_KEYS: ReadonlySet<string> = new Set<PaintKey>(['fill', 'stroke', 'color', 'line']);

/** A relation line's dash by `line` value; `solid` has none. Spec #730 grammar: `line(solid|dashed|dotted)`. */
const DASH: Readonly<Record<string, SafeValue | undefined>> = {
  dashed: R.relationDashed,
  dotted: R.relationDotted,
};

/** The `style` statements of `model` by their target. */
function stylesByTarget(model: C4BetaModel): ReadonlyMap<string, readonly C4BetaStyle[]> {
  const out = new Map<string, C4BetaStyle[]>();
  for (const style of model.styles)
    out.set(style.target, [...(out.get(style.target) ?? []), style]);
  return out;
}

/** The keys the statements for `targets`, in that order, give. */
function keysOf(
  styles: ReadonlyMap<string, readonly C4BetaStyle[]>,
  targets: readonly string[]
): Keys {
  const keys: Partial<Record<PaintKey, Said>> = {};
  for (const target of targets)
    for (const style of styles.get(target) ?? [])
      for (const { key, value } of style.entries)
        if (PAINT_KEYS.has(key))
          keys[key as PaintKey] = { value, where: `style ${target} ${key}`, ast: style.ast };
  return keys;
}

/** A style's colours through the colour check: `stroke` is `fill` when only a `fill` is given. */
function coloursOf(keys: Keys, colours: Colours): { fill?: Paint; stroke?: Paint; color?: Paint } {
  const check = (key: PaintKey): Paint | undefined =>
    keys[key] && colours.checked(keys[key].value, keys[key].where, keys[key].ast);
  const fill = check('fill');
  const stroke = check('stroke') ?? fill;
  const color = check('color');
  return { ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}), ...(color ? { color } : {}) };
}

/** What the paint functions share: the model's styles and items by AST id, and the colour check. */
interface Styling {
  readonly elementAt: ReadonlyMap<string, C4BetaElement>;
  readonly relationAt: ReadonlyMap<string, C4BetaRelation>;
  /** The element kind a legend kind row stands for, by the palette kind it is drawn with. */
  readonly modelKind: ReadonlyMap<string, string>;
  readonly styles: ReadonlyMap<string, readonly C4BetaStyle[]>;
  readonly colours: Colours;
}

/** The styles an element or boundary takes: its kind's, then each tag's. */
function elementStyle(st: Styling, ast: string): ReturnType<typeof coloursOf> {
  const element = st.elementAt.get(ast);
  return coloursOf(keysOf(st.styles, element ? [element.kind, ...element.tags] : []), st.colours);
}

/** One boundary's paint; the theme's colour is read only for a boundary, as a theme read puts its variable on the root. */
function boundaryPaint(st: Styling, b: C4BoundaryLayout): BoundaryPaint {
  const s = elementStyle(st, b.ast);
  const frame = st.colours.theme('c4BoundaryColor');
  const header = b.label ?? b.type ?? b.descr;
  return {
    fill: s.fill ?? 'none',
    stroke: s.stroke ?? frame,
    ...(header ? { text: s.color ?? frame } : {}),
  };
}

function boundaryPaints(st: Styling, layout: C4Layout): Map<number, BoundaryPaint> {
  return new Map(layout.boundaries.map((b) => [b.index, boundaryPaint(st, b)]));
}

function elementPaints(
  st: Styling,
  layout: C4Layout,
  palette: ReturnType<typeof kindPalette>
): Map<number, ElementPaint> {
  return new Map(
    layout.elements.map((e) => {
      const [fill, stroke] = palette(e.kind);
      const s = elementStyle(st, e.ast);
      return [
        e.index,
        { fill: s.fill ?? fill, stroke: s.stroke ?? stroke, text: s.color ?? ELEMENT_TEXT },
      ];
    })
  );
}

/** The dash `keys` name, as an attribute of a paint; none for a solid line. */
function dashOf(keys: Keys): Pick<RelationPaint, 'dash'> {
  const dash = DASH[keys.line?.value ?? ''];
  return dash ? { dash } : {};
}

/** The text and the box under it, for a relation that has a label or a technology. */
function labelOf(colours: Colours, r: C4RelationLayout, text: Paint): Partial<RelationPaint> {
  return r.label || r.techn ? { text, labelBkg: colours.theme('background') } : {};
}

/** One relation's paint: the theme's, then its tags' `stroke`, `color` and `line`. */
function relationPaint(st: Styling, r: C4RelationLayout): RelationPaint {
  const { colours } = st;
  const line = colours.theme('c4RelationColor');
  const keys = keysOf(st.styles, st.relationAt.get(r.ast)?.tags ?? []);
  const s = coloursOf(keys, colours);
  return {
    stroke: s.stroke ?? line,
    head: s.stroke ?? colours.theme('textColor'),
    ...labelOf(colours, r, s.color ?? line),
    ...dashOf(keys),
  };
}

function relationPaints(st: Styling, layout: C4Layout): Map<number, RelationPaint> {
  return new Map(layout.relations.map((r) => [r.index, relationPaint(st, r)]));
}

/** The paints `layout`'s items need. */
export function betaPaints(model: C4BetaModel, layout: C4Layout, ctx: C4RenderContext): Paints {
  const colours = new Colours(ctx);
  const st: Styling = {
    elementAt: new Map(model.elements.map((e) => [e.ast, e])),
    relationAt: new Map(model.relations.map((r) => [r.ast, r])),
    modelKind: new Map(model.elements.map((e) => [legacyKind(e), e.kind])),
    styles: stylesByTarget(model),
    colours,
  };
  const boundaries = boundaryPaints(st, layout);
  const palette = kindPalette(ctx, colours);
  const elements = elementPaints(st, layout, palette);
  const relations = relationPaints(st, layout);
  const title = layout.title ? colours.theme('c4TitleColor') : undefined;
  const legend = layout.legend && legendPaints(layout.legend, palette, st);
  if (colours.dropped.length > 0) ctx.warn(colourWarning(colours.dropped));
  return {
    elements,
    boundaries,
    relations,
    ...(title ? { title } : {}),
    ...(legend ? { legend } : {}),
  };
}

/** A swatch's fill and outline. */
type Swatch = LegendPaint['rows'][number];

/** A kind row: the kind's palette, or its kind style. */
function kindSwatch(
  kind: C4LegendRow['kind'] & string,
  palette: ReturnType<typeof kindPalette>,
  st: Styling
): Swatch {
  const [fill, stroke] = palette(kind);
  const s = coloursOf(keysOf(st.styles, [st.modelKind.get(kind) ?? kind]), st.colours);
  return { fill: s.fill ?? fill, stroke: s.stroke ?? stroke };
}

/** A tag row: the style's own colours (`stroke` falls back to `fill`, then to the text colour). */
function tagSwatch(tag: NonNullable<C4LegendRow['tag']>, st: Styling, text: Paint): Swatch {
  const where = (key: string): string => `style ${tag.name} ${key}`;
  const fill = st.colours.checked(tag.fill, where('fill'), tag.ast);
  const stroke = st.colours.checked(tag.stroke, where('stroke'), tag.ast);
  return { fill: fill ?? 'none', stroke: stroke ?? fill ?? text };
}

/**
 * The legend's paints: a kind row takes its kind's palette, or its kind style, as the elements do;
 * a tag row the style's own colours through the colour check (`stroke` falls back to `fill`, and
 * with neither the swatch is an outline in the text colour).
 */
function legendPaints(
  legend: C4LegendLayout,
  palette: ReturnType<typeof kindPalette>,
  st: Styling
): LegendPaint {
  const text = st.colours.theme('textColor');
  const rows = legend.rows.map((row) =>
    row.kind ? kindSwatch(row.kind, palette, st) : tagSwatch(row.tag!, st, text)
  );
  return { text, rows };
}
