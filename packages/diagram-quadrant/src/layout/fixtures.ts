/**
 * Hand-built `QuadrantModel`s for layout specs, until the parser (#301) produces them, and the
 * resolved default config.
 */
import { quadrantChartConfigDefaults } from '../generated/config-defaults.ts';
import type { QuadrantModel, QuadrantPoint, QuadrantStyles } from '../model.ts';
import type { QuadrantLayoutConfig } from './types.ts';

const DEFAULTS = quadrantChartConfigDefaults as QuadrantLayoutConfig;

/** `DEFAULTS` with `over` applied. */
export const config = (over: Partial<QuadrantLayoutConfig> = {}): QuadrantLayoutConfig => ({
  ...DEFAULTS,
  ...over,
});

const text = (t: string) => ({ text: t, markdown: false });

/** An empty chart (`quadrantChart` alone) with `over` applied. */
export function model(over: Partial<QuadrantModel> = {}): QuadrantModel {
  return {
    accTitle: '',
    accDescr: '',
    quadrants: [undefined, undefined, undefined, undefined],
    points: [],
    classes: new Map(),
    warnings: [],
    ...over,
  };
}

/** The four quadrant labels `Q1`…`Q4`. */
export const quadrants = (): QuadrantModel['quadrants'] => [
  { ast: 'q:1', ...text('Q1') },
  { ast: 'q:2', ...text('Q2') },
  { ast: 'q:3', ...text('Q3') },
  { ast: 'q:4', ...text('Q4') },
];

/** An axis with the given labels; an empty string leaves that label out. */
export const axis = (id: 'x' | 'y', start: string, end = ''): QuadrantModel['xAxis'] => ({
  ast: `ax:${id}`,
  ...(start ? { start: text(start) } : {}),
  ...(end ? { end: text(end) } : {}),
});

/** A point named `name` at `[x, y]` (coordinates as lexed). */
export const point = (
  name: string,
  x: string,
  y: string,
  styles: QuadrantStyles = {},
  className?: string
): QuadrantPoint => ({
  ast: `pt:${name}`,
  label: text(name),
  x,
  y,
  styles,
  ...(className === undefined ? {} : { className }),
});
