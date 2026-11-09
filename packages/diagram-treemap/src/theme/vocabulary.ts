import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';
import { PEER_SLOTS } from '../layout/metrics.ts';

/** `usedBy` of every row: treemap reads them all. */
const TREEMAP: readonly string[] = ['treemap'];

/**
 * The treemap's theme variables (spec #428, D406, D407; not core's, R-PERF-8):
 *
 * - `cScalePeer0`–`cScalePeer11` (D406): v12's section strokes, one colour per `cScale` slot,
 *   under v12's numbered names so an author's `themeVariables.cScalePeer3` still sets slot 3.
 *   Only treemap reads them; the table derives each from its `cScale` slot.
 * - `treemapTitleColor` and `treemapTitleFontSize` (D407): v12's `.treemapTitle` fill and size,
 *   also set by `themeVariables.treemap.titleColor` / `.titleFontSize` (D335, D540: key by key,
 *   the flat name wins).
 *
 * `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  ...Object.fromEntries(
    Array.from({ length: PEER_SLOTS }, (_, i) => [
      `cScalePeer${i}`,
      { alias: `tmp${i}`, kind: 'color', usedBy: TREEMAP } satisfies DiagramThemeVarDef,
    ])
  ),
  treemapTitleColor: { alias: 'tmc', kind: 'color', usedBy: TREEMAP, nested: 'titleColor' },
  treemapTitleFontSize: {
    alias: 'tms',
    kind: 'length',
    usedBy: TREEMAP,
    nested: 'titleFontSize',
  },
};

/**
 * Names the sources build at run time, which the theme usedBy scan for literals can't see:
 * `paints` in render/paint.ts reads the section strokes `cScalePeer${slot - 1}`.
 */
export const DYNAMIC_READS: readonly string[] = Array.from(
  { length: 12 },
  (_, n) => `cScalePeer${n}`
);
