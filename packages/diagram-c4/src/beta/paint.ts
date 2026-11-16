/**
 * The colours a c4-beta diagram is drawn with (spec #730): the paint table `drawScene` takes. An
 * element is an outline on the page: its fill the page's `background`, its outline the theme's
 * `c4<Kind>Border` and its text `c4<Kind>Color` (`External` for an element tagged `external`,
 * `Container` for a group or a deployment node drawn as a shape); boundaries, relations and the
 * title take the shared variables `c4BoundaryColor`, `c4RelationColor` and `c4TitleColor`. The
 * `c4` section's `<kind>_bg_color` keys are legacy C4's and colour nothing here. Every theme
 * colour is read before the root is written, in drawing order, as `render/paint.ts` does.
 *
 * A `style` paints what it targets over those defaults, so the order is the theme's row, then a
 * `style` for the element's kind, then the styles for its tags. An item takes the statements for its kind
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
  type BoundaryPaint,
  type ElementPaint,
  type LegendPaint,
  type Paints,
  type RelationPaint,
} from '../render/paint.ts';
import { isExternal } from '../model.ts';
import { legacyKind } from './prepare.ts';
import type {
  C4BetaElement,
  C4BetaElementKind,
  C4BetaModel,
  C4BetaRelation,
  C4BetaStyle,
} from './model.ts';

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
  readonly styles: ReadonlyMap<string, readonly C4BetaStyle[]>;
  readonly colours: Colours;
}

/** The two theme rows an element takes its colours from: its text and its outline. */
interface Rows {
  readonly color: string;
  readonly border: string;
}

const PERSON: Rows = { color: 'c4PersonColor', border: 'c4PersonBorder' };
const SYSTEM: Rows = { color: 'c4SoftwareSystemColor', border: 'c4SoftwareSystemBorder' };
const CONTAINER: Rows = { color: 'c4ContainerColor', border: 'c4ContainerBorder' };
const COMPONENT: Rows = { color: 'c4ComponentColor', border: 'c4ComponentBorder' };
const INFRASTRUCTURE: Rows = {
  color: 'c4InfrastructureNodeColor',
  border: 'c4InfrastructureNodeBorder',
};
const EXTERNAL: Rows = { color: 'c4ExternalColor', border: 'c4ExternalBorder' };

/** The rows by element kind; a group or a deployment node drawn as a shape takes a container's. */
const ROWS: Readonly<Record<C4BetaElementKind, Rows>> = {
  person: PERSON,
  softwareSystem: SYSTEM,
  container: CONTAINER,
  component: COMPONENT,
  infrastructureNode: INFRASTRUCTURE,
  group: CONTAINER,
  deploymentNode: CONTAINER,
};

/** An element's text and outline from the theme; an external element's win over its kind's. */
function themed(
  colours: Colours,
  kind: C4BetaElementKind,
  external: boolean
): { readonly text: Paint; readonly stroke: Paint } {
  const rows = external ? EXTERNAL : ROWS[kind];
  return { text: colours.theme(rows.color), stroke: colours.theme(rows.border) };
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

function elementPaints(st: Styling, layout: C4Layout): Map<number, ElementPaint> {
  return new Map(
    layout.elements.map((e) => {
      const element = st.elementAt.get(e.ast)!;
      const base = themed(st.colours, element.kind, isExternal(legacyKind(element)));
      const s = elementStyle(st, e.ast);
      return [
        e.index,
        {
          fill: s.fill ?? st.colours.theme('background'),
          stroke: s.stroke ?? base.stroke,
          text: s.color ?? base.text,
        },
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
    styles: stylesByTarget(model),
    colours,
  };
  const boundaries = boundaryPaints(st, layout);
  const elements = elementPaints(st, layout);
  const relations = relationPaints(st, layout);
  const title = layout.title ? colours.theme('c4TitleColor') : undefined;
  const legend = layout.legend && legendPaints(layout.legend, st);
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

/** A kind row: the colours of its kind's elements, or its kind style. */
function kindSwatch(row: C4LegendRow, st: Styling): Swatch {
  const kind = row.of!;
  const base = themed(st.colours, kind, isExternal(row.kind!));
  const s = coloursOf(keysOf(st.styles, [kind]), st.colours);
  return { fill: s.fill ?? st.colours.theme('background'), stroke: s.stroke ?? base.stroke };
}

/** A tag row: the style's own colours (`stroke` falls back to `fill`, then to the text colour). */
function tagSwatch(tag: NonNullable<C4LegendRow['tag']>, st: Styling, text: Paint): Swatch {
  const where = (key: string): string => `style ${tag.name} ${key}`;
  const fill = st.colours.checked(tag.fill, where('fill'), tag.ast);
  const stroke = st.colours.checked(tag.stroke, where('stroke'), tag.ast);
  return { fill: fill ?? 'none', stroke: stroke ?? fill ?? text };
}

/**
 * The legend's paints: a kind row takes its kind's colours, or its kind style, as the elements do;
 * a tag row the style's own colours through the colour check (`stroke` falls back to `fill`, and
 * with neither the swatch is an outline in the text colour).
 */
function legendPaints(legend: C4LegendLayout, st: Styling): LegendPaint {
  const text = st.colours.theme('textColor');
  const rows = legend.rows.map((row) =>
    row.kind ? kindSwatch(row, st) : tagSwatch(row.tag!, st, text)
  );
  return { text, rows };
}
