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
import { paletteSlots, type PaletteTint } from '@mermaid-js/shared/svg/document';
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
  readonly slotOf: (n: number) => PaletteTint | undefined;
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

/** Reads the variables `model` needs, and only those (an unread one declares no alias). */
export function paints(model: UsecaseModel, p: UsecasePrepared, ctx: UsecaseRenderContext): Paints {
  const { theme } = ctx;
  const c = (name: string): Paint => theme.color(name);
  const text = model.actors.length + model.useCases.length > 0 ? c('primaryTextColor') : undefined;
  const labelled = p.edges.some((e) => e.kind === 'relation' && e.label && e.label.width > 0);
  const json = model.jsonTables.length > 0;
  const generalization = model.relationships.some((r) => r.type === 'generalization');
  return {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    family: theme.value('fontFamily'),
    rotate: p.config.colorScheme === 'rotate',
    slotOf: paletteSlots(theme, 'slot'),
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

/**
 * The paints of a kind of part a section draws. `paints` reads a kind's variables exactly when
 * the model has one to draw (so an unread variable declares no alias on the root), and a section
 * draws a kind only when the model has one: a missing paint is a bug, never a theme's doing.
 */
export function need<T>(paint: T | undefined, kind: string): T {
  if (paint === undefined) throw new Error(`usecase renderer: no paints for a ${kind}`);
  return paint;
}
