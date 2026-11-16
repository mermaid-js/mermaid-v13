/**
 * The radar parser's public surface: the parser (#446), detection, and the lexer gated against
 * v12's Langium lexer (#445).
 */
import { sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { seenTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { LANGIUM_NAMES, RADAR_TRIVIA, T as RadarTokenKind } from './tokens.ts';
export { parseRadar } from './parser.ts';
export {
  RADAR_CURVE_SKIPPED,
  RADAR_EMPTY_RANGE,
  RADAR_MISSING_ENTRY,
  RADAR_NO_AXES,
  RADAR_TICKS_CLAMPED,
  RADAR_UNKNOWN_AXIS,
} from './normalise.ts';
export type { RadarParseOptions, RadarParseResult } from './parser.ts';
export { detectRadar } from './detect.ts';
export type * from './ast.ts';

export type RadarToken = SeenToken;

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function radarTokens(src: string): RadarToken[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const stream = lex(src, pre.bodyStart, view);
  return seenTokens(src, stream, view);
}
