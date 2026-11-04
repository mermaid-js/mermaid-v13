// The seam the sequence ASCII suites use (#150): the public `format: 'ascii'` API of
// `createMermaid()`, whose generated registry lists sequence with its `./ascii` entry (#145),
// and the cell layout that render drew, captured by a `postLayout` hook (D86: `units: 'cell'`).
import type { LaidOut } from '@mermaid-js/core';
import type { SequenceLayout } from '@mermaid-js/diagram-sequence';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';
import type { AsciiOptions } from './render.ts';

export type SequenceAsciiResult = TextRenderResult & { layout: SequenceLayout };

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

/** A sequence source drawn as text through the public API, with its cell layout. */
export async function renderSequenceAscii(
  text: string,
  options: AsciiOptions = {}
): Promise<SequenceAsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  return { ...result, layout: laid.layout as SequenceLayout };
}
