/**
 * The `sankey` options the renderer reads, with what v12 12.2.0 drew when they are unset:
 * `linkColor` `gradient`, and `useMaxWidth` `true` (v12's schema documents `false` for sankey,
 * but its bundled defaults hold `true`, and every sankey without the key drew `width="100%"`
 * with a `max-width`; GAPS #503). The layout reads the rest (`config.ts`).
 */
import type { SankeyDiagramConfig } from '@mermaid-js/core/config';
import { checkColor, type SafeColor } from '@mermaid-js/core/svg';

/** How links are stroked: a mode, or one colour for every link. */
type LinkPaint = 'gradient' | 'source' | 'target' | SafeColor;

export interface SankeyRenderOptions {
  readonly linkColor: LinkPaint;
  readonly useMaxWidth: boolean;
}

const MODES: ReadonlySet<string> = new Set(['gradient', 'source', 'target']);

/**
 * The renderer's options from the resolved `sankey` section. The config resolver does not
 * check types, so each value is read by its type. A mode is matched before the colour check
 * (`checkColor('gradient')` passes as a named colour); any other string is one colour for every
 * link when it passes the check, else the default gradient (spec #427 §Integration: dropped,
 * and the default used; #503 warns).
 */
export function sankeyRenderOptions(
  section: Readonly<SankeyDiagramConfig> | undefined
): SankeyRenderOptions {
  const given: unknown = section?.linkColor;
  let linkColor: LinkPaint = 'gradient';
  if (typeof given === 'string')
    linkColor = MODES.has(given) ? (given as LinkPaint) : (checkColor(given) ?? 'gradient');
  return { linkColor, useMaxWidth: section?.useMaxWidth !== false };
}
