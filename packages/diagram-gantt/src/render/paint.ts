/**
 * The gantt colours (spec #293 T4): what v12's gantt `styles.js` computed for each element,
 * as theme variables (D152). No theme name and no `look` is read (D153), and no gradient
 * outline or shadow is drawn in any theme (D278). v12 styled section slots 0–3 only; an element
 * in a higher slot took the root's `fill: textColor` and no stroke, as it does here.
 */
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import { GANTT_METRICS } from '../layout/metrics.ts';
import type { GanttBar, GanttLayout } from '../layout/types.ts';

type Theme = RenderContext['theme'];

/** v12's bar state class (`task`, `active`, `done`, `crit`, `activeCrit`, `doneCrit`). */
export type BarState = 'task' | 'active' | 'done' | 'crit' | 'activeCrit' | 'doneCrit';

/** v12's precedence: `active` before `done`, either combined with `crit`. */
export function stateOf(bar: GanttBar): BarState {
  if (bar.active) return bar.crit ? 'activeCrit' : 'active';
  if (bar.done) return bar.crit ? 'doneCrit' : 'done';
  return bar.crit ? 'crit' : 'task';
}

/** `.task0`–`.task3`, `.active0`… in `styles.js`: each state's fill and stroke. */
const STATE_PAINT: Readonly<Record<BarState, { readonly fill: string; readonly stroke: string }>> =
  {
    task: { fill: 'taskBkgColor', stroke: 'taskBorderColor' },
    active: { fill: 'activeTaskBkgColor', stroke: 'activeTaskBorderColor' },
    done: { fill: 'doneTaskBkgColor', stroke: 'doneTaskBorderColor' },
    crit: { fill: 'critBkgColor', stroke: 'critBorderColor' },
    activeCrit: { fill: 'activeTaskBkgColor', stroke: 'critBorderColor' },
    doneCrit: { fill: 'doneTaskBkgColor', stroke: 'critBorderColor' },
  };

/** `.section0`, `.section1, .section3`, `.section2`. */
const BAND_FILL: Readonly<Record<number, string>> = {
  0: 'sectionBkgColor',
  1: 'altSectionBkgColor',
  2: 'sectionBkgColor2',
  3: 'altSectionBkgColor',
};

/** The single-purpose colours, by role. */
const V = {
  text: 'textColor',
  title: 'titleColor',
  exclude: 'excludeBkgColor',
  grid: 'gridColor',
  today: 'todayLineColor',
  vert: 'vertLineColor',
  inside: 'taskTextColor',
  outside: 'taskTextOutsideColor',
  dark: 'taskTextDarkColor',
  clickable: 'taskTextClickableColor',
} as const;

const styled = (slot: number): boolean => slot < GANTT_METRICS.styledSlots;

function barColours(bar: GanttBar): { fill: string; stroke?: string } {
  const own = styled(bar.slot) ? STATE_PAINT[stateOf(bar)] : undefined;
  // `.vert` comes after the state rules in `styles.js`, so its stroke wins.
  const stroke = bar.kind === 'vert' ? V.vert : own?.stroke;
  return { fill: own?.fill ?? V.text, ...(stroke ? { stroke } : {}) };
}

/**
 * A task label's fill: v12's cascade over its classes, worked out. The `!important` rules
 * first, the more specific and then the later winning: a done task's outside label
 * (`.doneText0.taskTextOutsideLeft`), then a clickable one (`.taskText.clickable`), then the
 * state rules in sheet order (`activeText`, `doneText`, `doneCritText`, `vertText`,
 * `activeCritText`, the last winning). Then `.taskTextOutside0` over `.taskTextOutsideLeft`, and `.taskText0`.
 */
function labelColour(bar: GanttBar): string {
  const own = styled(bar.slot);
  const outside = bar.label.side !== 'inside';
  if (own && outside && bar.done) return V.outside;
  if (bar.clickable) return V.clickable;
  if (own && bar.active && bar.crit) return V.dark;
  if (bar.kind === 'vert') return V.vert;
  if (own && (bar.active || bar.done)) return V.dark;
  if (outside) return own ? V.outside : V.dark;
  return own ? V.inside : V.text;
}

export interface BarPaint {
  readonly fill: Paint;
  /** Undefined: no stroke (a slot v12 did not style). */
  readonly stroke?: Paint;
}

/** Every colour a render draws, read before the root is written so it declares their aliases. */
export interface Paints {
  readonly bars: readonly BarPaint[];
  readonly labels: readonly Paint[];
  readonly bands: readonly Paint[];
  readonly sections: readonly Paint[];
  readonly exclude: Paint;
  readonly grid: Paint;
  readonly tickText: Paint;
  readonly today: Paint;
  readonly title: Paint;
}

export function paints(theme: Theme, layout: GanttLayout): Paints {
  const refs = new Map<string, Paint>();
  const c = (name: string): Paint => {
    let ref = refs.get(name);
    if (ref === undefined) refs.set(name, (ref = theme.color(name)));
    return ref;
  };
  // Read only for what is drawn, so the root declares no unused alias.
  const when = (drawn: boolean, name: string): Paint => (drawn ? c(name) : 'none');
  const ticks = layout.bottomAxis.ticks.length > 0;
  return {
    bars: layout.bars.map((b) => {
      const { fill, stroke } = barColours(b);
      return { fill: c(fill), ...(stroke ? { stroke: c(stroke) } : {}) };
    }),
    labels: layout.bars.map((b) => c(labelColour(b))),
    bands: layout.bands.map((b) => c(BAND_FILL[b.slot] ?? V.text)),
    sections: layout.sections.map((s) => c(styled(s.slot) ? V.title : V.text)),
    exclude: when(layout.excludes.length > 0, V.exclude),
    grid: when(ticks, V.grid),
    tickText: when(ticks, V.text),
    today: when(layout.today !== undefined, V.today),
    title: when(layout.title !== undefined, V.title),
  };
}
