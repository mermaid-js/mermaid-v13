// The seams the ASCII conformance suites use (#48).
//
// `renderAscii` is the one place text is rendered: the public `format: 'ascii'` API (#47).
//
// `layoutCells` is the layout seam (`LayoutGraph → LayoutModel` in cells, D78), for the
// properties the text cannot show (boxes overlapping, edges under boxes) and for what the
// drawing should contain. It runs the flowchart's cell layout by hand, as the API does
// (`prepare` → `layoutAscii` with `ascii.maxWidth` as `availableWidth`).
import { layered } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { FlowLayout, FlowModel, FlowRenderContext } from '@mermaid-js/diagram-flowchart';
import { layoutAscii, type FlowAsciiContext } from '@mermaid-js/diagram-flowchart/ascii';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';

/** The `ascii` config section (DESIGN §6.3). */
export interface AsciiOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  maxWidth?: number;
}

export type AsciiResult = TextRenderResult;

let mermaid: Mermaid | undefined;
let theme: Theme | undefined;

const instance = (): Mermaid => {
  if (!mermaid) {
    mermaid = createMermaid();
    mermaid.initialize({ deterministic: true });
  }
  return mermaid;
};

async function context(text: string, options: AsciiOptions) {
  const prepared = await instance().prepare(text);
  theme ??= createTheme(await loadTheme('redux'), {});
  const config = { ...prepared.config, ascii: { ...options } } as FlowRenderContext['config'];
  const parse = prepared.parse as { model: FlowModel; ast: FlowAsciiContext['ast'] };
  const ctx: FlowAsciiContext = {
    config,
    measurer: undefined as never, // `layoutAscii` puts in the cell measurer
    theme,
    warn: () => undefined,
    title: preprocess(text).frontMatter?.title,
    ast: parse.ast,
    // R-ASCII-8: `maxWidth` is the layout's `availableWidth` in cells (#47 does this in api.ts).
    layout: (g) =>
      layered(
        options.maxWidth !== undefined && g.availableWidth === undefined
          ? { ...g, availableWidth: options.maxWidth }
          : g
      ),
  };
  return { ctx, model: parse.model };
}

/** `text` drawn as text through the public API (#47). Throws what `render` throws. */
export async function renderAscii(text: string, options: AsciiOptions = {}): Promise<AsciiResult> {
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await instance().prepare(text, call);
  return instance().renderSync(text, call);
}

/** The flowchart's cell layout of `text` (with `flow`: the views it was built from). */
export async function layoutCells(
  text: string,
  options: AsciiOptions = {}
): Promise<FlowLayout & { flow: NonNullable<FlowLayout['flow']>; title?: string }> {
  const { ctx, model } = await context(text, options);
  const layout = layoutAscii(model, ctx);
  return { ...layout, flow: layout.flow!, title: ctx.title };
}
