import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: railroad reads them all. */
const RAILROAD: readonly string[] = ['railroad'];

/** A colour row; `nested` keeps its literal type, which `RAILROAD_COLOUR_KEYS` is keyed by. */
const colour = <N extends string>(alias: string, nested: N) =>
  ({ alias, kind: 'color', usedBy: RAILROAD, nested }) as const satisfies DiagramThemeVarDef;

/**
 * Railroad's theme variables (spec #526 Q6, D516, D331, D335, D540): one colour per v12 style
 * key the renderer draws (`styles.ts:274-360`), each with v12's key under the table's `railroad`
 * section, so `themeVariables.railroad.terminalFill` sets `railroadTerminalFill`. v12's
 * `commentFill`, `commentStroke` and `commentTextColor` style `.railroad-comment`, which nothing
 * draws, so they have no variable. `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES = {
  railroadTerminalFill: colour('rtf', 'terminalFill'),
  railroadTerminalStroke: colour('rts', 'terminalStroke'),
  railroadTerminalTextColor: colour('rtt', 'terminalTextColor'),
  railroadNonTerminalFill: colour('rnf', 'nonTerminalFill'),
  railroadNonTerminalStroke: colour('rns', 'nonTerminalStroke'),
  railroadNonTerminalTextColor: colour('rnt', 'nonTerminalTextColor'),
  railroadLineColor: colour('rrl', 'lineColor'),
  railroadMarkerFill: colour('rrm', 'markerFill'),
  railroadSpecialFill: colour('rsf', 'specialFill'),
  railroadSpecialStroke: colour('rss', 'specialStroke'),
  railroadRuleNameColor: colour('rrn', 'ruleNameColor'),
} as const satisfies Readonly<Record<string, DiagramThemeVarDef>>;
