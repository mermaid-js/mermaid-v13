/**
 * Every theme variable one usecase render paints with, looked up before the root is written (so
 * the root declares each alias it uses), and the palette slots (v12 `usecaseDb.ts:313-335`,
 * `styles.ts:75-187`).
 *
 * - **Role colours** (`colorScheme: role`, the default): actors take `usecaseActorBkg` /
 *   `usecaseActorBorder`, use cases `usecaseBkg` / `usecaseBorder`, boundaries
 *   `usecaseBoundaryBkg` / `usecaseBoundaryBorder`, include and extend lines their own colours.
 * - **Palette slots**: on when the theme (or the author) carries a non-empty `borderColorArray`,
 *   never by theme name (D152). Actors then use cases share one counter, boundaries run their
 *   own from 0, notes and JSON tables take none. Every counted element is stamped
 *   `data-color-id="color-<slot>"`, as v12's `stampColorSlot` did under both schemes. A boundary
 *   is painted from its slot under both schemes (v12 `styles.ts:110-124`), actors and use cases
 *   only under `colorScheme: rotate`. The fill is `bkgColorArray`'s entry when that is not empty
 *   (redux-dark-color's is: it colours outlines only). An author's `classDef` / `style` wins.
 */
import type { Paint } from '@mermaid-js/core/svg';
import type { UsecasePrepared } from '../layout/prepare.ts';
import type { UsecaseModel } from '../model.ts';
import type { UsecaseRenderContext } from './context.ts';

type ThemeOf = UsecaseRenderContext['theme'];
type Length = ReturnType<ThemeOf['length']>;

/** A fill and an outline. */
export interface Fill {
  readonly fill: Paint;
  readonly stroke: Paint;
}

/** A palette slot: its id, its border, and its fill when `bkgColorArray` has one. */
export interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

/** Labels: the fill of their text. */
interface Ink {
  readonly text: Paint;
}

export interface Paints {
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  readonly family: string;
  /** `colorScheme: rotate`: actors and use cases take their slot's colours. */
  readonly rotate: boolean;
  /** The slot of the n-th counted element, or undefined without a palette. */
  readonly slotOf: (n: number) => Tint | undefined;
  /** Actor glyphs (and labels, in `text`). */
  readonly actor?: Fill & Ink;
  readonly usecase?: Fill & Ink;
  readonly boundary?: Fill & { readonly title: Paint };
  readonly note?: Fill & Ink;
  readonly json?: Fill & Ink;
  readonly edges?: {
    readonly line: Paint;
    readonly include: Paint;
    readonly extend: Paint;
    readonly width: Length;
    /** The extension triangle's fill (v12 `.marker.extension { fill: mainBkg }`). */
    readonly hollow?: Paint;
  };
  readonly edgeLabel?: Fill & Ink;
  /** The front-matter title: the root's ink (v12 `& { fill: textColor }`), no class rule. */
  readonly title?: Paint;
}

/**
 * The slot of each counted element (v12 `stampColorSlot`): `color-<n mod |border|>`, its border
 * colour, and its fill from `bkgColorArray` at that slot when the array is not empty.
 */
export function paletteSlots(theme: ThemeOf): (n: number) => Tint | undefined {
  const border = theme.palette('borderColorArray');
  const bkg = theme.palette('bkgColorArray');
  return (n) => {
    if (border.length === 0) return undefined;
    const slot = n % border.length;
    return {
      id: `color-${slot}`,
      stroke: border[slot]!,
      ...(bkg.length > 0 ? { fill: bkg[slot % bkg.length]! } : {}),
    };
  };
}

/** Reads the variables `model` needs, and only those (an unread one declares no alias). */
export function paints(model: UsecaseModel, p: UsecasePrepared, ctx: UsecaseRenderContext): Paints {
  const { theme } = ctx;
  const c = (name: string): Paint => theme.color(name);
  const text = model.actors.length + model.useCases.length > 0 ? c('primaryTextColor') : undefined;
  const section = ctx.config.usecase as Readonly<Record<string, unknown>> | undefined;
  const labelled = p.edges.some((e) => e.kind === 'relation' && e.label && e.label.width > 0);
  const json = model.jsonTables.length > 0;
  const generalization = model.relationships.some((r) => r.type === 'generalization');
  return {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    family: theme.value('fontFamily'),
    rotate: section?.colorScheme === 'rotate',
    slotOf: paletteSlots(theme),
    ...(model.actors.length > 0 && {
      actor: { fill: c('usecaseActorBkg'), stroke: c('usecaseActorBorder'), text: text! },
    }),
    ...(model.useCases.length > 0 && {
      usecase: { fill: c('usecaseBkg'), stroke: c('usecaseBorder'), text: text! },
    }),
    ...(model.boundaries.length > 0 && {
      boundary: {
        fill: c('usecaseBoundaryBkg'),
        stroke: c('usecaseBoundaryBorder'),
        title: c('titleColor'),
      },
    }),
    ...(model.notes.length > 0 && {
      note: { fill: c('noteBkgColor'), stroke: c('noteBorderColor'), text: c('noteTextColor') },
    }),
    ...(json && {
      json: { fill: c('mainBkg'), stroke: c('nodeBorder'), text: c('primaryTextColor') },
    }),
    ...(p.edges.length > 0 && {
      edges: {
        line: c('lineColor'),
        include: model.relationships.some((r) => r.type === 'include')
          ? c('usecaseIncludeLine')
          : c('lineColor'),
        extend: model.relationships.some((r) => r.type === 'extend')
          ? c('usecaseExtendLine')
          : c('lineColor'),
        width: theme.length('strokeWidth'),
        ...(generalization && { hollow: c('mainBkg') }),
      },
    }),
    ...(labelled && {
      edgeLabel: {
        fill: c('edgeLabelBackground'),
        stroke: 'none',
        text: c('primaryTextColor'),
      },
    }),
    ...(p.title && { title: c('textColor') }),
  };
}
