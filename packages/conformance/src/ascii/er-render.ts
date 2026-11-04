// The seam the ER ASCII suites use (#136): `renderErAscii` renders an ER diagram as text
// through the public `format: 'ascii'` API (#47: `prepare` + `renderSync`), on the API object
// `er/mermaid.ts` builds until T5 lists ER in the generated registry, and hands back the cell
// layout that render drew, captured by a `postLayout` hook (D86: `units: 'cell'`), as
// `render.ts` does for the flowchart.
//
// `ER_SECTION_DEFAULTS` go in as site config: they are the `er` section defaults T5 generates
// (GAPS.md #134). Once the generated defaults carry them, T5 drops them here and switches to
// `createMermaid()` from `mermaid`; the goldens do not change.
import type { LaidOut } from '@mermaid-js/core';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { ErLayout } from '@mermaid-js/diagram-er';
import type { TextRenderResult } from 'mermaid';
import { erMermaid } from '../er/mermaid.ts';
import type { AsciiOptions } from './render.ts';

/** v12's `er` section defaults, which T5 generates (GAPS.md #134). */
export const ER_SECTION_DEFAULTS = {
  nodeSpacing: 140,
  rankSpacing: 80,
  minEntityWidth: 100,
} as const;

/** The ER cell layout (with `er`: the views it was built from) and its title. */
export type ErCellLayout = ErLayout & { er: NonNullable<ErLayout['er']>; title?: string };

export type ErAsciiResult = TextRenderResult & { layout: ErCellLayout };

let mermaid: ReturnType<typeof erMermaid> | undefined;
let captured: LaidOut | undefined;

async function instance(): Promise<ReturnType<typeof erMermaid>> {
  if (!mermaid) {
    mermaid = erMermaid();
    mermaid.initialize({ deterministic: true, er: ER_SECTION_DEFAULTS });
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
