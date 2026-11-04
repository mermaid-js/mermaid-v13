// The seam the ER ASCII suites use (#136): `renderErAscii` renders an ER diagram as text
// through the public `format: 'ascii'` API (#47: `prepare` + `renderSync`) of `createMermaid()`,
// whose generated registry lists ER (#134), and hands back the cell layout that render drew,
// captured by a `postLayout` hook (D86: `units: 'cell'`), as `render.ts` does for the
// flowchart. No site config: v12's px defaults for the `er` section do not convert in cells, so
// the drawings use the cell profile's spacing and widths (D118).
import type { LaidOut } from '@mermaid-js/core';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { ErLayout } from '@mermaid-js/diagram-er';
import { createMermaid, type TextRenderResult } from 'mermaid';
import type { AsciiOptions } from './render.ts';

/** The ER cell layout (with `er`: the views it was built from) and its title. */
export type ErCellLayout = ErLayout & { er: NonNullable<ErLayout['er']>; title?: string };

export type ErAsciiResult = TextRenderResult & { layout: ErCellLayout };

let mermaid: ReturnType<typeof createMermaid> | undefined;
let captured: LaidOut | undefined;

async function instance(): Promise<ReturnType<typeof createMermaid>> {
  if (!mermaid) {
    mermaid = createMermaid();
    mermaid.initialize({ deterministic: true });
    await mermaid.registerExternalDiagrams([
      { id: 'conformance-capture', postLayout: (laidOut) => (captured = laidOut) },
    ]);
  }
  return mermaid;
}

/** `text` drawn as text through the public API, with its cell layout. Throws what `render` throws. */
export async function renderErAscii(
  text: string,
  options: AsciiOptions = {}
): Promise<ErAsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.kind !== 'graph' || laid.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  const layout = laid.layout as ErLayout;
  const title = preprocess(text).frontMatter?.title;
  return {
    ...result,
    layout: { ...layout, er: layout.er!, ...(title !== undefined ? { title } : {}) },
  };
}
