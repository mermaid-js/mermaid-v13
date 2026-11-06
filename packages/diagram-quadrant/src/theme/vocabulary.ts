import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * The quadrant chart's theme variables (spec #414 T1, D331), v12's names, moved out of core with
 * their aliases. `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
const q = (alias: string): DiagramThemeVarDef => ({ alias, kind: 'color', usedBy: ['quadrant'] });

export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  quadrant1Fill: q('q1f'),
  quadrant2Fill: q('q2f'),
  quadrant3Fill: q('q3f'),
  quadrant4Fill: q('q4f'),
  quadrant1TextFill: q('q1t'),
  quadrant2TextFill: q('q2t'),
  quadrant3TextFill: q('q3t'),
  quadrant4TextFill: q('q4t'),
  quadrantPointFill: q('qpf'),
  quadrantPointTextFill: q('qpt'),
  quadrantXAxisTextFill: q('qxt'),
  quadrantYAxisTextFill: q('qyt'),
  quadrantInternalBorderStrokeFill: q('qib'),
  quadrantExternalBorderStrokeFill: q('qeb'),
  quadrantTitleFill: q('qtf'),
};
