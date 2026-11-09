import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: event modeling reads them all. */
const EM: readonly string[] = ['eventmodeling'];

const color = (alias: string): DiagramThemeVarDef => ({ alias, kind: 'color', usedBy: EM });

/**
 * Event modeling's theme variables (spec #527 Q7, D527; spec #414 T0b, D331): v12's 14 flat
 * `em*` names, which only the classic themes set (`theme-*.js`), and `emTextColor`, new in v13,
 * for the box and lane text v12 left uncoloured. Flat only: v12 read no nested section.
 * `emSwimlaneBackgroundOdd` keeps its name, since authors set it. `pnpm gen:theme` writes
 * `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  emUiFill: color('euf'),
  emUiStroke: color('eus'),
  emProcessorFill: color('epf'),
  emProcessorStroke: color('eps'),
  emReadModelFill: color('erf'),
  emReadModelStroke: color('ers'),
  emCommandFill: color('ecf'),
  emCommandStroke: color('ecs'),
  emEventFill: color('eef'),
  emEventStroke: color('ees'),
  emSwimlaneBackgroundOdd: color('elb'),
  emSwimlaneBackgroundStroke: color('els'),
  emRelationStroke: color('erl'),
  emArrowhead: color('eah'),
  emTextColor: color('etx'),
};
