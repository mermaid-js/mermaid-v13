/**
 * The one place the visual pages, browser tests and gallery turn diagram text into SVG.
 *
 * Until the public `render()` (#15) lands this goes through the flowchart's test pipeline
 * (`renderForTest`). #15 swaps the body for `render()` from `mermaid`; callers keep this
 * signature, so the baseline, gallery and browser specs need no change.
 */
import { renderForTest } from '@mermaid-js/diagram-flowchart/testing';
import type { Measurer } from '@mermaid-js/core/text';

export interface RenderOptions {
  /** Integrator config, as `initialize()` gets it. The diagram's own front matter wins. */
  readonly config?: Readonly<Record<string, unknown>>;
  /** Prefix of the root's ids; give each diagram on a page its own. */
  readonly idPrefix?: string;
  /** Defaults to the deterministic table measurer, so browser and Node output match. */
  readonly measurer?: Measurer;
  /** `output.cssVariables`. Default true. */
  readonly cssVariables?: boolean;
}

export interface RenderOutput {
  readonly svg: string;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
}

export async function renderDiagram(
  text: string,
  options: RenderOptions = {}
): Promise<RenderOutput> {
  const { svg, warnings } = await renderForTest(text, options);
  return { svg, warnings };
}
