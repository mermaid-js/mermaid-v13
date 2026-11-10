/**
 * The colours the C4 renderer draws with (spec #522 §Renderer, D456): v12's, every author and
 * config colour through core's colour check (v12 wrote them raw). No theme name, no `look`, no
 * gradient or shadow (D227). Every theme colour is read before the root is written, and only
 * when something drawn uses it, so the root declares exactly the aliases used.
 *
 * - an element: fill and stroke `UpdateElementStyle`'s `$bgColor`/`$borderColor`, else the
 *   config's `<kind>_bg_color`/`_border_color`, else the schema's; text `$fontColor`, else
 *   `#FFFFFF` (v12 `c4ShapeAdapter.ts`);
 * - a boundary: fill `$bgColor`, else none; stroke `$borderColor`, else `c4BoundaryColor`; its
 *   header `c4BoundaryColor` (v12 drew `#444444` whatever `$fontColor` said);
 * - a relation: line and arrowheads `$lineColor`, else `c4RelationColor`; text `$textColor`,
 *   else `c4RelationColor`, on a box of the page's `background`;
 * - the title `c4TitleColor`.
 *
 * A value the check refuses is dropped and the default drawn, with one `C4_COLOR_INVALID` per
 * render naming each.
 */
import type { Warning } from '@mermaid-js/core';
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import { C4_COLOR_INVALID } from '../codes.ts';
import { c4Section, C4_ELEMENT_COLORS } from '../config.ts';
import type { C4Layout } from '../layout/types.ts';
import type { C4ElementKind, C4Model } from '../model.ts';
import type { C4RenderContext } from './context.ts';

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

/** A relation's line and arrowheads, and its text and its box (undefined when it has none). */
export interface RelationPaint {
  readonly stroke: Paint;
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

/** Every paint the layout's items need, read in drawing order. */
export function paints(model: C4Model, layout: C4Layout, ctx: C4RenderContext): Paints {
  const { theme } = ctx;
  const dropped: Dropped[] = [];
  const checked = (value: unknown, where: string, ast?: string): Paint | undefined => {
    if (value === undefined) return undefined;
    const colour = typeof value === 'string' ? checkColor(value) : undefined;
    if (colour === undefined)
      dropped.push({ where, value: JSON.stringify(value), ...(ast ? { ast } : {}) });
    return colour;
  };
  let boundaryColor: Paint | undefined;
  const boundaryInk = (): Paint => (boundaryColor ??= theme.color('c4BoundaryColor'));
  let relationColor: Paint | undefined;
  const relationInk = (): Paint => (relationColor ??= theme.color('c4RelationColor'));

  const boundaries = new Map<number, BoundaryPaint>();
  for (const b of layout.boundaries) {
    const m = model.boundaries[b.index]!;
    const at = (name: string): string => `$${name} of ${m.alias}`;
    const fill = checked(m.bgColor, at('bgColor'), m.ast) ?? 'none';
    const stroke = checked(m.borderColor, at('borderColor'), m.ast) ?? boundaryInk();
    const text = b.label || b.type || b.descr ? boundaryInk() : undefined;
    boundaries.set(b.index, { fill, stroke, ...(text ? { text } : {}) });
  }

  // The config palette: each key checked once, for the kinds drawn.
  const section = c4Section(ctx.config);
  const palette = new Map<C4ElementKind, readonly [Paint, Paint]>();
  const kindPaint = (kind: C4ElementKind): readonly [Paint, Paint] => {
    let got = palette.get(kind);
    if (!got) {
      const [bg, border] = C4_ELEMENT_COLORS[kind];
      const key = (part: string): string => `${kind}_${part}_color`;
      got = [
        checked(section[key('bg')], `c4.${key('bg')}`) ?? (checkColor(bg) as Paint),
        checked(section[key('border')], `c4.${key('border')}`) ?? (checkColor(border) as Paint),
      ];
      palette.set(kind, got);
    }
    return got;
  };
  const elements = new Map<number, ElementPaint>();
  for (const e of layout.elements) {
    const m = model.elements[e.index]!;
    const [bg, border] = kindPaint(e.kind);
    const at = (name: string): string => `$${name} of ${m.alias}`;
    elements.set(e.index, {
      fill: checked(m.bgColor, at('bgColor'), m.ast) ?? bg,
      stroke: checked(m.borderColor, at('borderColor'), m.ast) ?? border,
      text: checked(m.fontColor, at('fontColor'), m.ast) ?? ELEMENT_TEXT,
    });
  }

  let page: Paint | undefined;
  const relations = new Map<number, RelationPaint>();
  for (const r of layout.relations) {
    const m = model.relations[r.index]!;
    const at = (name: string): string => `$${name} of ${m.from} -> ${m.to}`;
    const stroke = checked(m.lineColor, at('lineColor'), m.ast) ?? relationInk();
    const given = checked(m.textColor, at('textColor'), m.ast);
    const text = r.label || r.techn ? (given ?? relationInk()) : undefined;
    if (text) page ??= theme.color('background');
    relations.set(r.index, { stroke, ...(text ? { text, labelBkg: page! } : {}) });
  }

  const title = layout.title ? theme.color('c4TitleColor') : undefined;
  if (dropped.length > 0) ctx.warn(colourWarning(dropped));
  return { elements, boundaries, relations, ...(title ? { title } : {}) };
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
