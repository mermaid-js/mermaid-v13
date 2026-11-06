import type { Paint } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';

/** The packet paints, each one of packet's theme variables (its table, `plugin.ts`). */
export interface Paints {
  readonly blockFill: Paint;
  readonly blockStroke: Paint;
  readonly label: Paint;
  readonly startByte: Paint;
  readonly endByte: Paint;
  /** Only when there is a title, so `auto` declares no alias nothing reads. */
  readonly title?: Paint;
}

/** Reads the paints a render draws with (pitfall 18: each variable read where it is drawn). */
export function paints(theme: Pick<Theme, 'color'>, titled: boolean): Paints {
  return {
    blockFill: theme.color('packetBlockFillColor'),
    blockStroke: theme.color('packetBlockStrokeColor'),
    label: theme.color('packetLabelColor'),
    startByte: theme.color('packetStartByteColor'),
    endByte: theme.color('packetEndByteColor'),
    ...(titled ? { title: theme.color('packetTitleColor') } : {}),
  };
}
