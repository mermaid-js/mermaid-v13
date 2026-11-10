// The seam the usecase ASCII suite uses (#569): the public `format: 'ascii'` API of
// `createMermaid()`, whose generated registry lists usecase with its `./ascii` entry, and the cell
// layout that render drew, captured by a `postLayout` hook (D86: `units: 'cell'`), as ER's and
// kanban's suites do.
import type { LaidOut } from '@mermaid-js/core';
import type { UsecaseLayout } from '@mermaid-js/diagram-usecase';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';
import type { AsciiOptions } from './render.ts';

/** The usecase cell layout, with the views it was built from. */
export type UsecaseCellLayout = UsecaseLayout & {
  usecase: NonNullable<UsecaseLayout['usecase']>;
};

export type UsecaseAsciiResult = TextRenderResult & { layout: UsecaseCellLayout };

let mermaid: Mermaid | undefined;
let captured: LaidOut | undefined;

async function instance(): Promise<Mermaid> {
  if (!mermaid) {
    mermaid = createMermaid();
    mermaid.initialize({ deterministic: true });
    await mermaid.registerExternalDiagrams([
      { id: 'conformance-capture', postLayout: (laidOut) => (captured = laidOut) },
    ]);
  }
  return mermaid;
}

/** A usecase source drawn as text through the public API, with its cell layout. */
export async function renderUsecaseAscii(
  text: string,
  options: AsciiOptions = {}
): Promise<UsecaseAsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.kind !== 'graph' || laid.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  const layout = laid.layout as UsecaseLayout;
  return { ...result, layout: { ...layout, usecase: layout.usecase! } };
}
