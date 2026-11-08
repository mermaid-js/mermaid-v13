/**
 * The `sankey` options the renderer reads, with what v12 12.2.0 drew when they are unset:
 * `linkColor` `gradient`, and `useMaxWidth` `true` (v12's schema documents `false` for sankey,
 * but its resolved config holds `true`, and every sankey without the key drew `width="100%"`
 * with a `max-width`). The layout reads the rest (`config.ts`).
 */
import { checkColor, type SafeColor } from '@mermaid-js/core/svg';

/** How links are stroked: a mode, or one colour for every link. */
export type SankeyLinkPaint = 'gradient' | 'source' | 'target' | SafeColor;

export interface SankeyRenderOptions {
  readonly linkColor: SankeyLinkPaint;
  readonly useMaxWidth: boolean;
}

const MODES: ReadonlySet<string> = new Set(['gradient', 'source', 'target']);

/**
 * The renderer's options from the resolved `sankey` section. A mode is matched before the
 * colour check (`checkColor('gradient')` passes as a named colour); any other value is one
 * colour for every link when it passes the check, else the default gradient (#503 warns).
 */
export function sankeyRenderOptions(
  section: Readonly<Record<string, unknown>> | undefined
): SankeyRenderOptions {
  const given = section?.linkColor;
  let linkColor: SankeyLinkPaint = 'gradient';
  if (typeof given === 'string')
    linkColor = MODES.has(given) ? (given as SankeyLinkPaint) : (checkColor(given) ?? 'gradient');
  return { linkColor, useMaxWidth: section?.useMaxWidth !== false };
}
