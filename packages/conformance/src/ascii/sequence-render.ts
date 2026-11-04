// The seam the sequence ASCII suites use (#150): the public `format: 'ascii'` API, with the
// sequence plugin registered as an external diagram that carries the `./ascii` entry's hook
// (until #145 puts the manifest's `ascii` key in the generated registry), and the cell layout
// that render drew, captured by a `postLayout` hook (D86: `units: 'cell'`).
import type { LaidOut } from '@mermaid-js/core';
import type { SequenceLayout } from '@mermaid-js/diagram-sequence';
import { ascii } from '@mermaid-js/diagram-sequence/ascii';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';
import { asTest, sequenceTest } from '../sequence/render-api.ts';
import type { AsciiOptions } from './render.ts';

export type SequenceAsciiResult = TextRenderResult & { layout: SequenceLayout };

/** The test registration with text output: `formats` and the hook #145's manifest will give. */
export const sequenceAsciiTest = {
  ...sequenceTest,
  formats: ['svg', 'ascii'] as const,
  ascii,
};

let mermaid: Mermaid | undefined;
let captured: LaidOut | undefined;

async function instance(): Promise<Mermaid> {
  if (!mermaid) {
    mermaid = createMermaid();
    mermaid.initialize({ deterministic: true });
    await mermaid.registerExternalDiagrams([
      sequenceAsciiTest,
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
  const src = asTest(text);
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(src, call);
  captured = undefined;
  const result = m.renderSync(src, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  return { ...result, layout: laid.layout as SequenceLayout };
}
