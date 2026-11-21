/**
 * The one place the visual pages, browser specs and gallery turn diagram text into SVG, through
 * the public `mermaid` API (`prepare` + `renderSync`, which take per-call config). An isolated
 * `createMermaid()` instance keeps the defaults of other code on the page out of it.
 *
 * The math extension is registered, as an installed `@mermaid-js/plugin-math` would be: `$$…$$`
 * renders as paths (D176), and `prepare` loads MathJax only for a diagram with math (D178).
 * So are `@mermaid-js/layout-elk`'s layouts: `layout: elk`, `elk.<algorithm>` and the
 * `flowchart-elk` header are laid out by ELK (D171), and `prepare` loads elkjs only for them.
 * So is `@mermaid-js/plugin-icons`, with the static packs of `icon-packs.ts`: `fa:fa-bell` in a
 * label and `A@{ icon: "aws:…" }` draw from them (D290–D299), and `prepare` loads only the packs
 * a diagram names.
 * And `@mermaid-js/plugin-hand-drawn`: `look: handDrawn` (or `handDrawn: true`) sketches the
 * outlines of flowchart, class, state and ER (D300); without it the look would only warn.
 */
import { createMermaid, type RenderResult } from 'mermaid';
import { registerDevPlugins } from './plugins.ts';

export interface RenderOptions {
  /** Integrator config, as `initialize()` gets it. The diagram's own front matter wins. */
  readonly config?: Readonly<Record<string, unknown>>;
  /** Prefix of the root's ids; give each diagram on a page its own. Default `mermaid-0`. */
  readonly idPrefix?: string;
  /**
   * `table` (default): the deterministic table measurer, so browser and Node output match.
   * `canvas`: what `render()` picks in a browser (the canvas measurer).
   */
  readonly measurer?: 'table' | 'canvas';
  /** `output.cssVariables`. Default true. */
  readonly cssVariables?: boolean;
}

export interface RenderOutput {
  readonly svg: string;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
}

const mermaid = createMermaid();
// The same plugins as the Dev Explorer (`plugins.ts`, #391).
const registered = registerDevPlugins(mermaid);

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
      ...(options.cssVariables === undefined
        ? {}
        : { output: { cssVariables: options.cssVariables } }),
    },
  };
  await registered;
  await mermaid.prepare(text, call);
  const result: RenderResult = mermaid.renderSync(text, call);
  return {
    svg: result.svg,
    warnings: result.warnings.map(({ code, message }) => ({ code, message })),
  };
}
