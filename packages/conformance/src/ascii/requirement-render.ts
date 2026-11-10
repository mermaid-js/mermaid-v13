// The seam the requirement ASCII suites use (#588, copied from `er-render.ts`):
// `renderRequirementAscii` renders a requirement diagram as text through the public
// `format: 'ascii'` API (`prepare` + `renderSync`) of `createMermaid()` and hands back the cell
// layout that render drew, captured by a `postLayout` hook (D86: `units: 'cell'`).
import type { LaidOut } from '@mermaid-js/core';
import type { RequirementLayout } from '@mermaid-js/diagram-requirement';
import { createMermaid, type TextRenderResult } from 'mermaid';
import type { AsciiOptions } from './render.ts';

/** The requirement cell layout, with the views it was built from. */
export type RequirementCellLayout = RequirementLayout & {
  requirement: NonNullable<RequirementLayout['requirement']>;
};

export type RequirementAsciiResult = TextRenderResult & { layout: RequirementCellLayout };

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
export async function renderRequirementAscii(
  text: string,
  options: AsciiOptions = {}
): Promise<RequirementAsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.kind !== 'graph' || laid.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  const layout = laid.layout as RequirementLayout;
  return { ...result, layout: { ...layout, requirement: layout.requirement! } };
}
