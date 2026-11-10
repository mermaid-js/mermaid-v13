// The seam the C4 ASCII suite uses (#545): the public `format: 'ascii'` API of `createMermaid()`,
// whose generated registry lists c4 with its `./ascii` entry, and the layout that render drew,
// captured by a `postLayout` hook (D86: `units: 'cell'`, the layout's `cell` set).
import type { LaidOut } from '@mermaid-js/core';
import type { C4Layout } from '@mermaid-js/diagram-c4';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';

export type C4Charset = 'unicode' | 'ascii';

export type C4AsciiResult = TextRenderResult & { layout: C4Layout };

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

/** A C4 source drawn as text through the public API, with the layout it drew. */
export async function renderC4Ascii(text: string, charset: C4Charset): Promise<C4AsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', ascii: { charset } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.units !== 'cell' || !(laid.layout as C4Layout).cell)
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  return { ...result, layout: laid.layout as C4Layout };
}
