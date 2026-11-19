/**
 * The first-party diagrams' theme tables (`DiagramPlugin.theme`, D331, spec #414), for the
 * theme specs that resolve a diagram's variables through `createTheme`. A table is undefined
 * until its type's rows move out of core (T1–T4); the specs pass it either way, so a move needs
 * no edit here.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import {
  THEME_VARIABLES,
  createTheme,
  type DiagramThemeTable,
  type Theme,
  type ThemeOptions,
  type ThemeSpec,
  type ThemeVarEntry,
  formatColor,
  parseColor,
} from '@mermaid-js/core/theme';
import { classDiagram } from '@mermaid-js/diagram-class';
import { er } from '@mermaid-js/diagram-er';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { gantt } from '@mermaid-js/diagram-gantt';
import { gitGraph } from '@mermaid-js/diagram-gitgraph';
import { journey } from '@mermaid-js/diagram-journey';
import { mindmap } from '@mermaid-js/diagram-mindmap';
import { pie } from '@mermaid-js/diagram-pie';
import { quadrant } from '@mermaid-js/diagram-quadrant';
import { requirement } from '@mermaid-js/diagram-requirement';
import { sequence } from '@mermaid-js/diagram-sequence';
import { state } from '@mermaid-js/diagram-state';
import { timeline } from '@mermaid-js/diagram-timeline';
import { xychart } from '@mermaid-js/diagram-xychart';

const table = (plugin: Pick<DiagramPlugin, 'id' | 'theme'>): DiagramThemeTable | undefined =>
  plugin.theme;

/** Each diagram type's table, by `usedBy`'s name for the type. */
export const DIAGRAM_TABLES: Readonly<Record<string, DiagramThemeTable | undefined>> = {
  class: table(classDiagram),
  er: table(er),
  flowchart: table(flowchart),
  gantt: table(gantt),
  gitgraph: table(gitGraph),
  journey: table(journey),
  mindmap: table(mindmap),
  pie: table(pie),
  quadrant: table(quadrant),
  requirement: table(requirement),
  sequence: table(sequence),
  state: table(state),
  timeline: table(timeline),
  xychart: table(xychart),
};

/**
 * v12's value of a variable in its resolved `getThemeVariables()`: the flat name, or else, for a
 * table with a `section`, the variable's nested key there (D335): `xyChartTitleColor` is v12's
 * `xyChart.titleColor`.
 */
export function v12Value(old: Readonly<Record<string, unknown>>, name: string): unknown {
  if (Object.hasOwn(old, name)) return old[name];
  for (const t of Object.values(DIAGRAM_TABLES)) {
    const nested = t?.vars[name]?.nested;
    if (t?.section === undefined || nested === undefined) continue;
    const block = old[t.section];
    return block && typeof block === 'object'
      ? (block as Record<string, unknown>)[nested]
      : undefined;
  }
  return undefined;
}

/** The flat v13 name of a key v12 kept nested (D335): `xyChart` + `titleColor` → `xyChartTitleColor`. */
export const flatName = (section: string, nested: string): string =>
  `${section}${nested[0]!.toUpperCase()}${nested.slice(1)}`;

/**
 * A palette as hex colours joined by `,`, comparable across versions: v12's comma-separated
 * string (`xyChart.plotColorPalette`) or v13's list (`theme.palette()`).
 */
export function paletteColours(v: unknown): string {
  let items: readonly unknown[] = [];
  if (typeof v === 'string') items = v.split(',');
  else if (Array.isArray(v)) items = v as unknown[];
  return items
    .map((c) => {
      const rgba = typeof c === 'string' ? parseColor(c.trim()) : undefined;
      return rgba ? formatColor(rgba) : String(c);
    })
    .join(',');
}

/** Every variable a render can read: core's vocabulary and every table's `vars`. */
export const VOCABULARY: Readonly<Record<string, ThemeVarEntry>> =
  Object.fromEntries<ThemeVarEntry>([
    ...Object.entries(THEME_VARIABLES),
    ...Object.values(DIAGRAM_TABLES).flatMap((t) => Object.entries(t?.vars ?? {})),
  ]);

/**
 * The shared inputs of D332 and D381: v13's, with no v12 counterpart. A theme fills them with
 * v12's values of the diagram variables that read them (`pie1`, `fillType0`, `pieTitleTextColor`,
 * `activationBkgColor`, …), which the oracle specs compare instead, so the neo and neo-dark specs
 * leave these out of their v12 comparison rather than listing them in `DIFFERENCES`. The
 * palettes and inks of T1a; the muted surface, its border, link ink, text on lines, soft border
 * and frame border of T2; the row fills, link label fill and nested body of T3 (read with
 * `inline()`); the badge and callout of T1b, which gitGraph's commit and tag labels read; the
 * canvas fill, line, text and item fill, and the band and guide line (#1041), that the named classic themes pin where v12 keeps its
 * constructor value under an override (D656).
 */
export const D332_INPUTS: readonly string[] = [
  'seriesColorArray',
  'plotColorArray',
  'headingTextColor',
  'seriesTextColor',
  'mutedBkg',
  'mutedBorder',
  'linkInkColor',
  'lineTextColor',
  'softBorder',
  'frameBorder',
  'badgeBkg',
  'badgeTextColor',
  'calloutBkg',
  'calloutTextColor',
  'calloutBorder',
  'rowBkg',
  'rowAltBkg',
  'linkLabelBkg',
  'nestedBkg',
  'canvasBkg',
  'canvasLineColor',
  'canvasTextColor',
  'canvasItemBkg',
  'bandBkg',
  'guideLineColor',
];

/**
 * One theme over every table: each method that takes a variable name answers from the theme
 * built with the table that owns it, and core's own theme answers the rest. For the oracle
 * specs, which compare every variable, core's and the diagrams' together.
 */
export function everyTable(
  spec: ThemeSpec,
  options: ThemeOptions = {},
  tables: Readonly<Record<string, DiagramThemeTable | undefined>> = DIAGRAM_TABLES
): Theme {
  const core = createTheme(spec, options);
  const owned = new Map<string, Theme>();
  for (const t of Object.values(tables)) {
    if (!t) continue;
    const theme = createTheme(spec, { ...options, diagram: t });
    for (const name of Object.keys(t.vars)) owned.set(name, theme);
  }
  return new Proxy(core, {
    get(target, key, receiver) {
      const v: unknown = Reflect.get(target, key, receiver);
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        const owner = typeof args[0] === 'string' ? owned.get(args[0]) : undefined;
        const self = owner ?? target;
        return (Reflect.get(self, key) as (...a: unknown[]) => unknown).apply(self, args);
      };
    },
  });
}
