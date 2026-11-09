/**
 * The `sankey` options the renderer reads, with what v12 12.2.0 drew when they are unset:
 * `linkColor` `gradient`, and `useMaxWidth` `true` (v12's schema documented `false` for sankey,
 * but its bundled defaults held `true`, and every sankey without the key drew `width="100%"`
 * with a `max-width`; v13's schema default is `true`, #503). The layout reads the rest
 * (`config.ts`), and warns once for a `linkColor` dropped here and for a `useMaxWidth` that is
 * not a boolean (read here as the default, `true`).
 */
import type { SankeyDiagramConfig } from '@mermaid-js/core/config';
import { linkPaint, type LinkPaint } from '../config.ts';

export interface SankeyRenderOptions {
  readonly linkColor: LinkPaint;
  readonly useMaxWidth: boolean;
}

/**
 * The renderer's options from the resolved `sankey` section. The config resolver does not
 * check types, so each value is read by its type: a `linkColor` that is neither a mode nor a
 * colour draws the default gradient (spec #427 §Integration: dropped, and the default used).
 */
export function sankeyRenderOptions(
  section: Readonly<SankeyDiagramConfig> | undefined
): SankeyRenderOptions {
  return {
    linkColor: linkPaint(section?.linkColor) ?? 'gradient',
    useMaxWidth: section?.useMaxWidth !== false,
  };
}
