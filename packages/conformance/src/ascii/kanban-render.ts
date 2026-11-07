// The seam the kanban ASCII suite uses (#466): the public `format: 'ascii'` API of
// `createMermaid()`, whose generated registry lists kanban with its `./ascii` entry, and the
// cell layout that render drew, captured by a `postLayout` hook (D86: `units: 'cell'`).
import type { LaidOut } from '@mermaid-js/core';
import type { KanbanLayout } from '@mermaid-js/diagram-kanban';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';
import type { AsciiOptions } from './render.ts';

export type KanbanAsciiResult = TextRenderResult & { layout: KanbanLayout };

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

/** A kanban source drawn as text through the public API, with its cell layout. */
export async function renderKanbanAscii(
  text: string,
  options: AsciiOptions = {}
): Promise<KanbanAsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  return { ...result, layout: laid.layout as KanbanLayout };
}
