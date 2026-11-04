/**
 * What every step of the sequence layout shares: the metrics, the fonts, the resolved options
 * and the columns, plus small helpers.
 */
import type { SequenceDiagramConfig } from '@mermaid-js/core/config';
import type { RenderContext } from '@mermaid-js/core';
import { checkStyle } from '@mermaid-js/core/svg';
import { fontSizePx, layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { ArrowKind, SequenceParticipant, SequenceStatement } from '../model.ts';
import { FONT_WEIGHT, sequenceMetrics, type SequenceMetrics } from './metrics.ts';
import type { PlacedLabel } from './types.ts';

/** What the layout reads from the render context. */
export type SequenceLayoutContext = Pick<
  RenderContext,
  'config' | 'measurer' | 'units' | 'theme' | 'warn'
>;

export interface Fonts {
  readonly actor: FontKey;
  readonly message: FontKey;
  readonly note: FontKey;
  readonly title: FontKey;
}

/** One participant's column while the layout runs. */
export interface Column {
  readonly p: SequenceParticipant;
  readonly label: MeasuredLabel;
  readonly width: number;
  height: number;
  /** The gap after the column. */
  margin: number;
  x: number;
  top: number;
  /** Top of its bottom box when it is destroyed. */
  stopy?: number;
  visible: boolean;
}

export interface Env {
  readonly m: SequenceMetrics;
  readonly fonts: Fonts;
  readonly seq: Readonly<SequenceDiagramConfig>;
  /** `wrap` config: labels wrap unless they say `nowrap:`. */
  readonly autoWrap: boolean;
  readonly mirror: boolean;
  readonly rightAngles: boolean;
  readonly columns: ReadonlyMap<string, Column>;
  /** Participant ids in declaration order, hidden ones included: v12's neighbours. */
  readonly order: readonly string[];
  /** Each id's place in `order`. */
  readonly index: ReadonlyMap<string, number>;
  /** The render's warning sink. */
  readonly warn: SequenceLayoutContext['warn'];
  measure(text: string, font: FontKey, max: number): MeasuredLabel;
}

// Arrows whose end needs no room for a head (v12 `buildMessageModel`).
export const NO_HEAD_GAP: ReadonlySet<ArrowKind> = new Set<ArrowKind>([
  'solid_open',
  'dotted_open',
  'stick_top',
  'stick_bottom',
  'stick_top_dotted',
  'stick_bottom_dotted',
  'solid_arrow_top_reverse_dotted',
  'solid_arrow_bottom_reverse_dotted',
  'stick_arrow_top_reverse',
  'stick_arrow_bottom_reverse',
  'stick_arrow_top_reverse_dotted',
  'stick_arrow_bottom_reverse_dotted',
  'solid_arrow_top_reverse',
  'solid_arrow_bottom_reverse',
]);
// Arrows with a head at the start as well.
export const START_GAP: ReadonlySet<ArrowKind> = new Set<ArrowKind>([
  'bidirectional_solid',
  'bidirectional_dotted',
  'solid_arrow_top_reverse_dotted',
  'solid_arrow_bottom_reverse_dotted',
  'solid_arrow_top_reverse',
  'solid_arrow_bottom_reverse',
]);
export const BIDIRECTIONAL: ReadonlySet<ArrowKind> = new Set<ArrowKind>([
  'bidirectional_solid',
  'bidirectional_dotted',
]);
/** Arrows whose head is drawn at the start (`…_reverse…`). */
export const REVERSE_ARROWS: ReadonlySet<ArrowKind> = new Set<ArrowKind>([
  'solid_arrow_top_reverse',
  'solid_arrow_top_reverse_dotted',
  'solid_arrow_bottom_reverse',
  'solid_arrow_bottom_reverse_dotted',
  'stick_arrow_top_reverse',
  'stick_arrow_top_reverse_dotted',
  'stick_arrow_bottom_reverse',
  'stick_arrow_bottom_reverse_dotted',
]);

function weightOf(value: unknown): number {
  if (value === 'bold' || value === 'bolder') return FONT_WEIGHT.bold;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : FONT_WEIGHT.normal;
}

/**
 * The fonts labels are measured in, and so drawn in (the renderer reads them too). A per-key
 * family the style check refuses falls back to the Mermaid font, with a warning when `warn`
 * is given (the layout passes it, so it is raised once per render).
 */
export function fontsOf(
  ctx: Pick<SequenceLayoutContext, 'config' | 'theme'>,
  warn?: SequenceLayoutContext['warn']
): Fonts {
  const seq = (ctx.config.sequence ?? {}) as Readonly<Record<string, unknown>>;
  const family = ctx.theme.value('fontFamily');
  const size = ctx.theme.number('fontSize');
  // Family keys inherit the Mermaid font; size and weight keys apply when set.
  const font = (prefix: string): FontKey => {
    const key = `${prefix}FontFamily`;
    const f = seq[key];
    let safe: string | undefined;
    if (typeof f === 'string' && f.trim() !== '') {
      safe = checkStyle(['font-family:' + f]).text['font-family'] as string | undefined;
      if (safe === undefined)
        warn?.({
          code: 'STYLE_VALUE_DROPPED',
          message: `Dropped sequence.${key} ${JSON.stringify(f)}: it is not a font family Mermaid allows`,
          path: `sequence.${key}`,
        });
    }
    const s = fontSizePx(seq[`${prefix}FontSize`], size);
    return {
      family: safe ?? family,
      size: s !== undefined && s > 0 ? s : size,
      weight: weightOf(seq[`${prefix}FontWeight`]),
    };
  };
  return {
    actor: font('actor'),
    message: font('message'),
    note: font('note'),
    title: { family, size, weight: FONT_WEIGHT.normal },
  };
}

/** The shared state of one layout, before the columns are measured. */
export function envOf(
  ctx: SequenceLayoutContext,
  participants: readonly SequenceParticipant[]
): Omit<Env, 'columns'> {
  const seq = ctx.config.sequence ?? {};
  return {
    m: sequenceMetrics(ctx.units, seq),
    fonts: fontsOf(ctx, (w) => ctx.warn(w)),
    seq,
    autoWrap: ctx.config.wrap === true || seq.wrap === true,
    mirror: seq.mirrorActors !== false,
    rightAngles: seq.rightAngles === true,
    order: participants.map((p) => p.id),
    index: new Map(participants.map((p, i) => [p.id, i])),
    warn: (w) => ctx.warn(w),
    measure: (text, font, max) => layoutLabel(text, font, max > 0 ? max : 1, ctx.measurer),
  };
}

const neighbour = (env: Env, id: string, step: number): string | undefined => {
  const i = env.index.get(id);
  return i === undefined ? undefined : env.order[i + step];
};
export const prevOf = (env: Env, id: string): string | undefined => neighbour(env, id, -1);
export const nextOf = (env: Env, id: string): string | undefined => neighbour(env, id, 1);

/** The x of a column's lifeline. */
export const centerOf = (env: Env, c: Column): number => c.x + env.m.half(c.width);

/** Each statement, depth first, in source order. */
export function* walk(statements: readonly SequenceStatement[]): Generator<SequenceStatement> {
  for (const s of statements) {
    yield s;
    if (s.kind === 'fragment') for (const section of s.sections) yield* walk(section.statements);
    else if (s.kind === 'rect') yield* walk(s.statements);
  }
}

/** The x of a label of width `w` aligned in the span `lo`…`hi`, `pad` in from its sides. */
export function alignX(
  env: Env,
  align: unknown,
  span: readonly [number, number],
  w: number,
  pad: number
): number {
  const [lo, hi] = span;
  if (align === 'left') return lo + pad;
  if (align === 'right') return hi - pad - w;
  return lo + env.m.half(hi - lo - w);
}

export const placed = (text: MeasuredLabel, x: number, y: number): PlacedLabel => ({
  x,
  y,
  width: text.width,
  height: text.height,
  text,
});
