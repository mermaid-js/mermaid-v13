/**
 * The c4-beta legend (spec #730 T3), pure and without a DOM in three steps: `legendEntries` says
 * which rows the model earns, `measureLegend` measures their text in the fonts it is drawn in, and
 * `placeLegend` puts the heading and rows at a corner. `./prepare.ts` calls the first two and
 * `./scene.ts` the third, below the drawing, so nothing else can lie under it.
 *
 * - a kind row for each kind of element the diagram draws as a shape, labelled with the name the
 *   element's type line uses (`Software System`, `Person`; `External Software System` for an
 *   element tagged `external`), in the order each kind (or external variant) first appears in
 *   the source, as v12's c4-beta lists them; an element drawn as a frame (a `group`, a
 *   `deploymentNode`, any element with a body) has no fill and no row. A kind row's swatch takes
 *   that kind's palette, as the elements do.
 * - then a tag row, named as the author wrote the tag, for each `style` whose target is a tag some element or relation carries, with the
 *   style's `fill` and `stroke` as written; a style for a kind, for a tag nothing carries, or
 *   with neither colour has none. Later statements for one tag override earlier entries, and a
 *   value the colour check refuses (a misspelt name) counts as none, as its items draw the theme's.
 * - none at all for `legend off`, or when there is no row to show.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import { Style } from '@mermaid-js/core/text';
import type { C4Fonts } from '../config.ts';
import { placed, type Measure, type Measured } from '../layout/layout.ts';
import { fixedText } from '../label-text.ts';
import type { C4LegendLayout, C4LegendRow } from '../layout/types.ts';
import { isExternal, type C4ElementKind } from '../model.ts';
import { C4_BETA_METRICS as B } from './metrics.ts';
import { styleColour } from './colour.ts';
import type { C4BetaElement, C4BetaModel } from './model.ts';

/** The heading of the legend. */
const TITLE = 'Legend';

/** A row before it is measured: its text, and what its swatch is painted from. */
export interface LegendEntry {
  readonly label: string;
  readonly kind?: C4ElementKind;
  /** The element's own kind, which `kind` (the legacy one) folds: an infrastructure node into a container. */
  readonly of?: C4BetaElement['kind'];
  readonly tag?: NonNullable<C4LegendRow['tag']>;
}

/** The kind rows: one per kind in use, `kindOf` giving the palette kind an element draws with. */
function kindEntries(
  model: C4BetaModel,
  kindOf: (element: C4BetaElement) => C4ElementKind,
  nameOf: (kind: C4BetaElement['kind']) => string
): LegendEntry[] {
  const rows = new Map<string, LegendEntry>();
  for (const element of model.elements) {
    if (element.boundary) continue;
    const kind = kindOf(element);
    const name = nameOf(element.kind);
    const label = isExternal(kind) ? `External ${name}` : name;
    if (!rows.has(label)) rows.set(label, { label, kind, of: element.kind });
  }
  return [...rows.values()];
}

/** A tag style's colours, merged over its statements. */
interface TagColours {
  name: string;
  ast: AstId;
  fill?: string;
  stroke?: string;
}

/** `tag` without the colours the colour check refuses: its items draw the theme's instead. */
function drawable(tag: TagColours): TagColours {
  const { fill, stroke, ...rest } = tag;
  return {
    ...rest,
    ...(fill !== undefined && styleColour(fill) ? { fill } : {}),
    ...(stroke !== undefined && styleColour(stroke) ? { stroke } : {}),
  };
}

/**
 * The tag rows: one per `style` target some element or relation carries, and only for a style
 * with a `fill` or a `stroke`: a swatch shows nothing else yet, so another style's row would be an
 * empty outline.
 */
function tagEntries(model: C4BetaModel): LegendEntry[] {
  const used = new Set([
    ...model.elements.flatMap((e) => e.tags),
    ...model.relations.flatMap((r) => r.tags),
  ]);
  const merged = new Map<string, TagColours>();
  for (const style of model.styles) {
    if (!used.has(style.target)) continue;
    const colours = merged.get(style.target) ?? { name: style.target, ast: style.ast };
    for (const { key, value } of style.entries) {
      if (key === 'fill' || key === 'stroke') colours[key] = value;
    }
    merged.set(style.target, colours);
  }
  return [...merged]
    .map(([label, tag]): [string, TagColours] => [label, drawable(tag)])
    .filter(([, tag]) => tag.fill !== undefined || tag.stroke !== undefined)
    .map(([label, tag]) => ({ label, tag }));
}

/** The rows `model` earns, in drawing order: its kinds, then its tag styles. */
export function legendEntries(
  model: C4BetaModel,
  kindOf: (element: C4BetaElement) => C4ElementKind,
  nameOf: (kind: C4BetaElement['kind']) => string
): readonly LegendEntry[] {
  return model.legend ? [...kindEntries(model, kindOf, nameOf), ...tagEntries(model)] : [];
}

/** A legend measured, with the size it takes. */
export interface BetaLegend {
  readonly title: Measured;
  readonly rows: readonly { readonly entry: LegendEntry; readonly label: Measured }[];
  readonly width: number;
  readonly height: number;
}

/** `m` drawn from its box's left edge, so rows start at one x whatever the font makes of them. */
const leftAligned = (m: Measured | undefined): Measured | undefined =>
  m && { ...m, text: { ...m.text, left: true } };

/** A row is as high as its swatch or its text, whichever is taller. */
const rowHeight = (label: Measured): number => Math.max(B.legendSwatch, label.text.height);

/** The legend of `entries` measured; none when there is no entry or the text cannot be measured. */
export function measureLegend(
  entries: readonly LegendEntry[],
  fonts: C4Fonts,
  measure: Measure
): BetaLegend | undefined {
  const title = leftAligned(measure(fixedText(TITLE), fonts.boundary, Infinity, Style.Bold));
  const rows = entries.flatMap((entry) => {
    const label = leftAligned(measure(fixedText(entry.label), fonts.message, Infinity));
    return label ? [{ entry, label }] : [];
  });
  if (!title || rows.length === 0) return undefined;
  const labelWidth = Math.max(...rows.map((r) => r.label.text.width));
  const height = rows.reduce(
    (sum, r) => sum + B.legendRowGap + rowHeight(r.label),
    title.text.height
  );
  return {
    title,
    rows,
    width: Math.max(title.text.width, B.legendSwatch + B.legendSwatchGap + labelWidth),
    height,
  };
}

/** The legend with its top-left corner at (x, y). */
export function placeLegend(legend: BetaLegend, x: number, y: number): C4LegendLayout {
  let top = y + legend.title.text.height;
  const rows = legend.rows.map(({ entry, label }): C4LegendRow => {
    top += B.legendRowGap;
    const h = rowHeight(label);
    const row: C4LegendRow = {
      swatch: {
        x,
        y: top + (h - B.legendSwatch) / 2,
        width: B.legendSwatch,
        height: B.legendSwatch,
      },
      label: placed(
        label,
        x + B.legendSwatch + B.legendSwatchGap,
        top + (h - label.text.height) / 2
      ),
      ...(entry.kind ? { kind: entry.kind } : {}),
      ...(entry.of ? { of: entry.of } : {}),
      ...(entry.tag ? { tag: entry.tag } : {}),
    };
    top += h;
    return row;
  });
  return {
    box: { x, y, width: legend.width, height: legend.height },
    title: placed(legend.title, x, y),
    rows,
  };
}
