// The seam the ASCII conformance suites use (#48): `renderAscii` renders text through the public
// `format: 'ascii'` API (#47) and hands back, with the result, the cell layout that render drew
// (`LayoutGraph → LayoutModel` in cells, D78). The layout is captured by a `postLayout`
// extension hook (D86: the hook sees `units: 'cell'`), so the properties the text cannot show
// (boxes overlapping, edges under boxes) are checked on the layout the API actually produced.
import type { LaidOut } from '@mermaid-js/core';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { FlowLayout } from '@mermaid-js/diagram-flowchart';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';

/** The `ascii` config section (DESIGN §6.3). */
export interface AsciiOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  maxWidth?: number;
}

/** The flowchart's cell layout (with `flow`: the views it was built from) and its title. */
export type CellLayout = FlowLayout & { flow: NonNullable<FlowLayout['flow']>; title?: string };

export type AsciiResult = TextRenderResult & { layout: CellLayout };

let mermaid: Mermaid | undefined;
let captured: LaidOut | undefined;

async function instance(): Promise<Mermaid> {
  if (!mermaid) {
    mermaid = createMermaid();
    mermaid.initialize({ deterministic: true });
    await mermaid.registerExternalDiagrams([
      {
        id: 'conformance-capture',
        postLayout: (laidOut) => (captured = laidOut),
      },
    ]);
  }
  return mermaid;
}

/** `text` drawn as text through the public API (#47), with its cell layout. Throws what `render` throws. */
export async function renderAscii(text: string, options: AsciiOptions = {}): Promise<AsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.kind !== 'graph' || laid.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  // The flowchart's postLayout value is its FlowLayout (LaidOut declares LayoutModel: GAPS.md).
  const layout = laid.layout as FlowLayout;
  return {
    ...result,
    layout: { ...layout, flow: layout.flow!, title: preprocess(text).frontMatter?.title },
  };
}
