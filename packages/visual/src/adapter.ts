/**
 * The one place the visual pages, browser specs and gallery turn diagram text into SVG, through
 * the public `mermaid` API (`prepare` + `renderSync`, which take per-call config). An isolated
 * `createMermaid()` instance keeps the defaults of other code on the page out of it.
 */
import type { Measurer } from '@mermaid-js/core/text';
import { createMermaid, type RenderResult } from 'mermaid';

export interface RenderOptions {
  /** Integrator config, as `initialize()` gets it. The diagram's own front matter wins. */
  readonly config?: Readonly<Record<string, unknown>>;
  /** Prefix of the root's ids; give each diagram on a page its own. Default `mermaid-0`. */
  readonly idPrefix?: string;
  /**
   * `table` (default): the deterministic table measurer, so browser and Node output match.
   * `canvas`: what `render()` picks in a browser (the canvas measurer). Or a custom measurer.
   */
  readonly measurer?: 'table' | 'canvas' | Measurer;
  /** `output.cssVariables`. Default true. */
  readonly cssVariables?: boolean;
}

export interface RenderOutput {
  readonly svg: string;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
}

const mermaid = createMermaid();

export async function renderDiagram(
  text: string,
  options: RenderOptions = {}
): Promise<RenderOutput> {
  const m = options.measurer ?? 'table';
  const call = {
    id: options.idPrefix ?? 'mermaid-0',
    config: {
      ...options.config,
      deterministic: m === 'table',
      ...(typeof m === 'object' ? { measurer: m } : {}),
      ...(options.cssVariables === undefined
        ? {}
        : { output: { cssVariables: options.cssVariables } }),
    },
  };
  await mermaid.prepare(text, call);
  const result: RenderResult = mermaid.renderSync(text, call);
  return {
    svg: result.svg,
    warnings: result.warnings.map(({ code, message }) => ({ code, message })),
  };
}
