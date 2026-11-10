/**
 * The colours the C4 renderer draws with (spec #522 §Renderer, D456): v12's, every author and
 * config colour through core's colour check (v12 wrote them raw). No theme name, no `look`, no
 * gradient or shadow (D227). Every theme colour is read before the root is written, and only
 * when something drawn uses it, so the root declares exactly the aliases used.
 *
 * - a boundary: fill `$bgColor`, else none; stroke `$borderColor`, else `c4BoundaryColor`; its
 *   header `c4BoundaryColor` (v12 drew `#444444` whatever `$fontColor` said);
 * - an element: fill and stroke `UpdateElementStyle`'s `$bgColor`/`$borderColor`, else the
 *   config's `<kind>_bg_color`/`_border_color`, else the section's generated default (the
 *   schema's); text `$fontColor`, else
 *   `#FFFFFF` (v12 `c4ShapeAdapter.ts`);
 * - a relation: line `$lineColor`, else `c4RelationColor`; text `$textColor`, else
 *   `c4RelationColor`, on a box of the page's `background`; arrowheads the page's `textColor`
 *   (v12's markers took the root's `fill`, whatever `$lineColor` said);
 * - the title `c4TitleColor`.
 *
 * A value the check refuses is dropped and the default drawn, with one `C4_COLOR_INVALID` per
 * render naming each.
 */
import type { Warning } from '@mermaid-js/core';
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import { C4_COLOR_INVALID } from '../codes.ts';
import { c4Section } from '../config.ts';
import { c4ConfigDefaults } from '../generated/config-defaults.ts';
import type { C4Layout } from '../layout/types.ts';
import type { C4ElementKind, C4Model } from '../model.ts';
import type { C4RenderContext } from './context.ts';

/** The two palette keys of an element kind: `<kind>_bg_color` and `<kind>_border_color`. */
type Part = 'bg' | 'border';

/** v12's element text (`c4ShapeAdapter.ts`). */
const ELEMENT_TEXT = checkColor('#FFFFFF') as Paint;

/** An element's outline and text. */
export interface ElementPaint {
  readonly fill: Paint;
  readonly stroke: Paint;
  readonly text: Paint;
}

/** A boundary's frame and header; `text` is undefined when it has no header. */
export interface BoundaryPaint {
  readonly fill: Paint;
  readonly stroke: Paint;
  readonly text?: Paint;
}

/** A relation's line, its arrowheads, and its text and the box under it (undefined when it has none). */
export interface RelationPaint {
  readonly stroke: Paint;
  readonly head: Paint;
  readonly text?: Paint;
  readonly labelBkg?: Paint;
}

export interface Paints {
  /** By the element's index in `C4Model.elements`. */
  readonly elements: ReadonlyMap<number, ElementPaint>;
  /** By the boundary's index in `C4Model.boundaries`. */
  readonly boundaries: ReadonlyMap<number, BoundaryPaint>;
  /** By the relation's index in `C4Model.relations`. */
  readonly relations: ReadonlyMap<number, RelationPaint>;
  readonly title?: Paint;
}

/** A dropped colour: where it was given (a `$name` of an item, or a config key) and its value. */
interface Dropped {
  readonly where: string;
  readonly value: string;
  readonly ast?: string;
}

/** Checks author and config colours, collecting what it drops; reads theme colours once. */
class Colours {
  readonly dropped: Dropped[] = [];
  private readonly read = new Map<string, Paint>();

  constructor(private readonly ctx: C4RenderContext) {}

  /** The theme variable `name` as paint, read once. */
  theme(name: string): Paint {
    let paint = this.read.get(name);
    if (paint === undefined) this.read.set(name, (paint = this.ctx.theme.color(name)));
    return paint;
  }

  /** `value` if the colour check allows it; else undefined, and `where` noted when one was given. */
  checked(value: unknown, where: string, ast?: string): Paint | undefined {
    if (value === undefined) return undefined;
    const colour = typeof value === 'string' ? checkColor(value) : undefined;
    if (colour === undefined)
      this.dropped.push({ where, value: JSON.stringify(value), ...(ast ? { ast } : {}) });
    return colour;
  }
}

/** Where an `Update…Style` argument was given: `$<name> of <owner>`. */
const named = (name: string, owner: string): string => `$${name} of ${owner}`;

/** Every paint the layout's items need, read in drawing order. */
export function paints(model: C4Model, layout: C4Layout, ctx: C4RenderContext): Paints {
  const colours = new Colours(ctx);
  const boundaries = boundaryPaints(model, layout, colours);
  const elements = elementPaints(model, layout, ctx, colours);
  const relations = relationPaints(model, layout, colours);
  const title = layout.title ? colours.theme('c4TitleColor') : undefined;
  if (colours.dropped.length > 0) ctx.warn(colourWarning(colours.dropped));
  return { elements, boundaries, relations, ...(title ? { title } : {}) };
}

function boundaryPaints(
  model: C4Model,
  layout: C4Layout,
  colours: Colours
): Map<number, BoundaryPaint> {
  const out = new Map<number, BoundaryPaint>();
  for (const b of layout.boundaries) {
    const { alias, ast, bgColor, borderColor } = model.boundaries[b.index]!;
    const fill = colours.checked(bgColor, named('bgColor', alias), ast) ?? 'none';
    const stroke =
      colours.checked(borderColor, named('borderColor', alias), ast) ??
      colours.theme('c4BoundaryColor');
    const header = b.label ?? b.type ?? b.descr;
    out.set(b.index, {
      fill,
      stroke,
      ...(header ? { text: colours.theme('c4BoundaryColor') } : {}),
    });
  }
  return out;
}

function elementPaints(
  model: C4Model,
  layout: C4Layout,
  ctx: C4RenderContext,
  colours: Colours
): Map<number, ElementPaint> {
  // The config palette: each key checked once, for the kinds drawn.
  const section = c4Section(ctx.config);
  const palette = new Map<C4ElementKind, readonly [Paint, Paint]>();
  const kindPaint = (kind: C4ElementKind): readonly [Paint, Paint] => {
    let got = palette.get(kind);
    if (!got) {
      const key = (part: Part): `${C4ElementKind}_${Part}_color` => `${kind}_${part}_color`;
      // A key the config leaves unset is the default already; a refused one draws the default.
      const paint = (part: Part): Paint =>
        colours.checked(section[key(part)], `c4.${key(part)}`) ??
        (checkColor(c4ConfigDefaults[key(part)] ?? '') as Paint);
      got = [paint('bg'), paint('border')];
      palette.set(kind, got);
    }
    return got;
  };
  const out = new Map<number, ElementPaint>();
  for (const e of layout.elements) {
    const { alias, ast, bgColor, borderColor, fontColor } = model.elements[e.index]!;
    const [bg, border] = kindPaint(e.kind);
    out.set(e.index, {
      fill: colours.checked(bgColor, named('bgColor', alias), ast) ?? bg,
      stroke: colours.checked(borderColor, named('borderColor', alias), ast) ?? border,
      text: colours.checked(fontColor, named('fontColor', alias), ast) ?? ELEMENT_TEXT,
    });
  }
  return out;
}

function relationPaints(
  model: C4Model,
  layout: C4Layout,
  colours: Colours
): Map<number, RelationPaint> {
  const out = new Map<number, RelationPaint>();
  for (const r of layout.relations) {
    const { from, to, ast, lineColor, textColor } = model.relations[r.index]!;
    const owner = `${from} -> ${to}`;
    const stroke =
      colours.checked(lineColor, named('lineColor', owner), ast) ??
      colours.theme('c4RelationColor');
    const given = colours.checked(textColor, named('textColor', owner), ast);
    const text = r.label || r.techn ? (given ?? colours.theme('c4RelationColor')) : undefined;
    const head = colours.theme('textColor');
    out.set(r.index, {
      stroke,
      head,
      ...(text ? { text, labelBkg: colours.theme('background') } : {}),
    });
  }
  return out;
}

/** The one `C4_COLOR_INVALID` of a render, naming every dropped value. */
function colourWarning(dropped: readonly Dropped[]): Warning {
  const astIds = [...new Set(dropped.flatMap((d) => (d.ast ? [d.ast] : [])))];
  const config = dropped.find((d) => d.ast === undefined);
  return {
    code: C4_COLOR_INVALID,
    message: `Not a colour, so the default is drawn instead: ${dropped.map((d) => `${d.where} ${d.value}`).join(', ')}`,
    ...(config ? { path: config.where } : {}),
    ...(astIds.length > 0 ? { astIds } : {}),
  };
}
