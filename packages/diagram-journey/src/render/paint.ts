// The colours and fonts the journey renderer draws with, looked up before the root is written
// so the root `style` declares exactly the aliases used (theme.rootStyleText()). Every colour
// is a theme variable, a config colour the author set, or one of v12's fixed greys (D245);
// nothing depends on a theme name or `look` (D152), and there is no shadow or gradient (D227).
import type { RenderContext, Warning } from '@mermaid-js/core';
import {
  checkColor,
  checkStyle,
  fixedPaint,
  type Attrs,
  type Paint,
  type SafeValue,
} from '@mermaid-js/core/svg';
import type { FontKey } from '@mermaid-js/core/text';
import { fontsOf } from '../layout/env.ts';
import { FONT_WEIGHT, SECTION_SLOTS } from '../layout/metrics.ts';
import type { JourneyLayout } from '../layout/types.ts';

type Theme = RenderContext['theme'];

/** What the paints read from the render context. */
export type PaintContext = Pick<RenderContext, 'config' | 'theme' | 'warn'>;

/** v12's fixed greys and black (D245): constants in every theme. */
export const FIXED_COLORS = {
  /** Band and task outlines (v12 `getNoteRect`). */
  box: fixedPaint('#666'),
  /** Eyes and mouth (v12 `#666` and `.mouth { stroke: #666 }`). */
  feature: fixedPaint('#666'),
  /** The face outline (v12 `.face { stroke: #999 }`). */
  face: fixedPaint('#999'),
  /** Actor dot outlines, in the legend and on tasks. */
  dot: fixedPaint('#000'),
} as const;

/**
 * v12's `journey.actorColours` default, used while the config has none. This is the only copy:
 * the schema has no default for the key, since core's config merge unions arrays, so a schema
 * default would keep these six ahead of an author's list (an author's list replaces them).
 */
const V12_ACTOR_COLOURS = ['#8FBC8F', '#7CFC00', '#00FFFF', '#20B2AA', '#B0E0E6', '#FFFFE0'];

/** A theme variable name, written through a call so the `usedBy` scan sees it. */
const v = (name: string): string => name;

/** `fillType0`…`fillType7`, one per section slot (D241); each theme pins v12's values. */
const FILL_TYPES: readonly string[] = [
  v('fillType0'),
  v('fillType1'),
  v('fillType2'),
  v('fillType3'),
  v('fillType4'),
  v('fillType5'),
  v('fillType6'),
  v('fillType7'),
];

/** v12 styles `actor-0`…`actor-5` from `actor<n>`; no theme sets one (D249). */
const AUTHOR_ACTORS: readonly string[] = [
  v('actor0'),
  v('actor1'),
  v('actor2'),
  v('actor3'),
  v('actor4'),
  v('actor5'),
];

/** A variable no theme spec gives a value resolves to this (core `Resolver`). */
const UNSET = 'currentColor';

/** The author's `actor<slot>`, when set (D249); else the renderer uses `actorColours`. */
function authorActor(theme: Theme, slot: number): Paint | undefined {
  const name = AUTHOR_ACTORS[slot];
  if (name === undefined || theme.value(name) === UNSET) return undefined;
  return theme.color(name);
}

/** Font attributes for labels measured in `f`; empty where the root's font applies. */
function fontAttrs(f: FontKey, family: string, size: number): Attrs {
  return {
    'font-family':
      f.family === family
        ? undefined
        : (checkStyle(['font-family:' + f.family]).text['font-family'] as SafeValue | undefined),
    'font-size': f.size === size ? undefined : f.size,
    'font-weight': f.weight === FONT_WEIGHT.normal ? undefined : (String(f.weight) as SafeValue),
  };
}

function dropped(warn: (w: Warning) => void, key: string, value: unknown): void {
  warn({
    code: 'STYLE_VALUE_DROPPED',
    message: `Dropped journey.${key} value ${JSON.stringify(String(value).slice(0, 60))}: it is not a CSS colour Mermaid allows`,
    path: `journey.${key}`,
  });
}

/** A config colour list, checked; undefined when unset. A refused entry warns and is left out. */
function colourList(ctx: PaintContext, key: string): Paint[] | undefined {
  const raw = (ctx.config.journey as Readonly<Record<string, unknown>> | undefined)?.[key];
  if (!Array.isArray(raw)) return undefined;
  const out: Paint[] = [];
  for (const c of raw as unknown[]) {
    const safe = typeof c === 'string' ? checkColor(c) : undefined;
    if (safe) out.push(safe);
    else dropped(ctx.warn, key, c);
  }
  return out;
}

export interface Paints {
  /** Lines, the arrowhead, legend text, and text nothing else colours (D245, v12 `line`). */
  readonly text: Paint;
  /** A section slot's fill (D241): `fillType<slot>`. */
  readonly fillOf: (slot: number) => Paint;
  /** Section and task text by band index: `sectionColours` when set (D225), else `text`. */
  readonly labelOf: (band: number | undefined) => Paint;
  readonly face: Paint;
  /** An actor dot's fill by its slot: the author's `actor<n>`, else `actorColours` (D249). */
  readonly actorOf: (slot: number) => Paint;
  /** `titleColor` when set (D248), else `text`. */
  readonly title: Paint;
  readonly fonts: {
    /** Task and section labels. */
    readonly task: Attrs;
    readonly legend: Attrs;
    readonly title: Attrs;
  };
}

/** Every colour and font the body uses; parts the layout does not draw read nothing. */
export function paints(ctx: PaintContext, l: JourneyLayout): Paints {
  const { theme } = ctx;
  const cfg = (ctx.config.journey ?? {}) as Readonly<Record<string, unknown>>;
  const text = theme.color('textColor');
  // Each drawn slot reads its own `fillType<n>`; tasks before the first section take slot 0.
  const fills = new Map<number, Paint>();
  for (const s of [...l.bands.map((b) => b.slot), ...l.tasks.map((t) => t.slot)])
    if (!fills.has(s)) fills.set(s, theme.color(FILL_TYPES[s % SECTION_SLOTS]!));
  const sectionColours = colourList(ctx, 'sectionColours');
  const configured = colourList(ctx, 'actorColours');
  const palette: readonly Paint[] =
    configured && configured.length > 0 ? configured : V12_ACTOR_COLOURS.map(fixedPaint);
  const actors = new Map<number, Paint>();
  for (const dot of [...l.legend.map((e) => e.dot), ...l.tasks.flatMap((t) => t.dots)])
    if (!actors.has(dot.slot))
      actors.set(dot.slot, authorActor(theme, dot.slot) ?? palette[dot.slot % palette.length]!);
  let title = text;
  const tc = cfg.titleColor;
  if (l.title && typeof tc === 'string' && tc.trim() !== '') {
    const safe = checkColor(tc);
    if (safe) title = safe;
    else dropped(ctx.warn, 'titleColor', tc);
  }
  const family = theme.value('fontFamily');
  const size = theme.number('fontSize');
  const f = fontsOf(ctx);
  return {
    text,
    fillOf: (slot) => fills.get(slot) ?? text,
    labelOf: (band) =>
      band === undefined || !sectionColours || sectionColours.length === 0
        ? text
        : sectionColours[band % sectionColours.length]!,
    face: l.tasks.length > 0 ? theme.color('faceColor') : text,
    actorOf: (slot) => actors.get(slot) ?? text,
    title,
    fonts: {
      task: fontAttrs(f.task, family, size),
      legend: fontAttrs(f.legend, family, size),
      title: fontAttrs(f.title, family, size),
    },
  };
}
