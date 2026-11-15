/**
 * The colours a c4-beta diagram is drawn with (spec #730): the paint table `drawScene` takes. Until
 * the theme ticket (T2) adds `c4<Kind>Color` rows, an element takes its legacy kind's palette from
 * the `c4` section (v12's colours), and boundaries, relations and the title the shared variables
 * `c4BoundaryColor`, `c4RelationColor` and `c4TitleColor`. Every theme colour is read before the
 * root is written, in drawing order, as `render/paint.ts` does.
 */
import type { C4Layout, C4LegendLayout } from '../layout/types.ts';
import type { C4RenderContext } from '../render/context.ts';
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

/** The paints `layout`'s items need. */
export function betaPaints(layout: C4Layout, ctx: C4RenderContext): Paints {
  const colours = new Colours(ctx);
  const boundaries = new Map<number, BoundaryPaint>();
  for (const b of layout.boundaries) {
    const header = b.label ?? b.type ?? b.descr;
    boundaries.set(b.index, {
      fill: 'none',
      stroke: colours.theme('c4BoundaryColor'),
      ...(header ? { text: colours.theme('c4BoundaryColor') } : {}),
    });
  }
  const palette = kindPalette(ctx, colours);
  const elements = new Map<number, ElementPaint>();
  for (const e of layout.elements) {
    const [fill, stroke] = palette(e.kind);
    elements.set(e.index, { fill, stroke, text: ELEMENT_TEXT });
  }
  const relations = new Map<number, RelationPaint>();
  for (const r of layout.relations) {
    const stroke = colours.theme('c4RelationColor');
    relations.set(r.index, {
      stroke,
      head: colours.theme('textColor'),
      ...(r.label || r.techn ? { text: stroke, labelBkg: colours.theme('background') } : {}),
    });
  }
  const title = layout.title ? colours.theme('c4TitleColor') : undefined;
  const legend = layout.legend && legendPaints(layout.legend, palette, colours);
  if (colours.dropped.length > 0) ctx.warn(colourWarning(colours.dropped));
  return {
    elements,
    boundaries,
    relations,
    ...(title ? { title } : {}),
    ...(legend ? { legend } : {}),
  };
}

/**
 * The legend's paints: a kind row takes its kind's palette, as the elements do; a tag row the
 * style's own colours through the colour check (`stroke` falls back to `fill`, and with neither
 * the swatch is an outline in the text colour).
 */
function legendPaints(
  legend: C4LegendLayout,
  palette: ReturnType<typeof kindPalette>,
  colours: Colours
): LegendPaint {
  const text = colours.theme('textColor');
  const rows = legend.rows.map((row) => {
    if (row.kind) {
      const [fill, stroke] = palette(row.kind);
      return { fill, stroke };
    }
    const where = (key: string): string => `style ${row.tag?.name} ${key}`;
    const fill = colours.checked(row.tag?.fill, where('fill'), row.tag?.ast);
    const stroke = colours.checked(row.tag?.stroke, where('stroke'), row.tag?.ast);
    return { fill: fill ?? 'none', stroke: stroke ?? fill ?? text };
  });
  return { text, rows };
}
