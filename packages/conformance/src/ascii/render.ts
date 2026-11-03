// The seams the ASCII conformance suites use (#48).
//
// `renderAscii` is the one place text is rendered. Until the public `format: 'ascii'` API
// lands (#47) it runs the pipeline by hand, as #46's `flow.fixtures.ts` does: `prepare`
// (detect, front matter, config, parse) → the flowchart's cell layout → its `./ascii` hook.
// When #47 lands its body becomes
// `instance().renderSync(text, { format: 'ascii', config: { ascii: options } })` after the
// `prepare`.
//
// `layoutCells` is the layout seam (`LayoutGraph → LayoutModel` in cells, D78), for the
// properties the text cannot show (boxes overlapping, edges under boxes) and for what the
// drawing should contain. It stays when `renderAscii` switches.
import { cellWidth } from '@mermaid-js/core/ascii';
import { layered } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type {
  FlowLayout,
  FlowModel,
  FlowRenderContext,
  FlowWarning,
} from '@mermaid-js/diagram-flowchart';
import { ascii, layoutAscii, type FlowAsciiContext } from '@mermaid-js/diagram-flowchart/ascii';
import { createMermaid, type Mermaid } from 'mermaid';

/** The `ascii` config section (DESIGN §6.3). */
export interface AsciiOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  maxWidth?: number;
}

/** The part of `TextRenderResult` (DESIGN §3, D80) the suites read. */
export interface AsciiResult {
  text: string;
  rows: number;
  columns: number;
  diagramType: string;
  warnings: readonly FlowWarning[];
}

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
  const warnings: FlowWarning[] = [];
  const parse = prepared.parse as { model: FlowModel; ast: FlowAsciiContext['ast'] };
  const ctx: FlowAsciiContext = {
    config,
    measurer: undefined as never, // `layoutAscii` puts in the cell measurer
    theme,
    warn: (w) => void warnings.push(w),
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
  return { prepared, ctx, warnings, model: parse.model };
}

/** `text` drawn as text. Throws what the pipeline throws (a `MermaidError` for bad input). */
export async function renderAscii(text: string, options: AsciiOptions = {}): Promise<AsciiResult> {
  const { prepared, ctx, warnings, model } = await context(text, options);
  const out = ascii(model, layoutAscii(model, ctx), ctx);
  const lines = out === '' ? [] : out.split('\n');
  return {
    text: out,
    rows: lines.length,
    columns: Math.max(0, ...lines.map((l) => cellWidth(l))),
    diagramType: prepared.diagramType,
    warnings,
  };
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
