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
} from '@mermaid-js/core/theme';
import { classDiagram } from '@mermaid-js/diagram-class';
import { er } from '@mermaid-js/diagram-er';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { journey } from '@mermaid-js/diagram-journey';
import { pie } from '@mermaid-js/diagram-pie';
import { quadrant } from '@mermaid-js/diagram-quadrant';
import { sequence } from '@mermaid-js/diagram-sequence';
import { state } from '@mermaid-js/diagram-state';
import { timeline } from '@mermaid-js/diagram-timeline';

const table = (plugin: Pick<DiagramPlugin, 'id' | 'theme'>): DiagramThemeTable | undefined =>
  plugin.theme;

/** Each diagram type's table, by `usedBy`'s name for the type. */
export const DIAGRAM_TABLES: Readonly<Record<string, DiagramThemeTable | undefined>> = {
  class: table(classDiagram),
  er: table(er),
  flowchart: table(flowchart),
  journey: table(journey),
  pie: table(pie),
  quadrant: table(quadrant),
  sequence: table(sequence),
  state: table(state),
  timeline: table(timeline),
};

/**
 * The D332 generic shared inputs: v13-only names that themes of one family write differently and
 * a diagram's table reads with `inline()`. v12 has no such name, so the oracle specs leave them
 * out of the v12 comparison; the diagram variables reading them are still compared.
 */
export const D332_INPUTS: readonly string[] = [
  'mutedBkg',
  'mutedBorder',
  'linkInkColor',
  'lineTextColor',
];

/** Every variable a render can read: core's vocabulary and every table's `vars`. */
export const VOCABULARY: Readonly<Record<string, ThemeVarEntry>> =
  Object.fromEntries<ThemeVarEntry>([
    ...Object.entries(THEME_VARIABLES),
    ...Object.values(DIAGRAM_TABLES).flatMap((t) => Object.entries(t?.vars ?? {})),
  ]);

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
