// The seam the agentflow ASCII suites use (#551): the public `format: 'ascii'` API of
// `createMermaid()`, whose generated registry lists agentflow with its `./ascii` entry, and the
// cell layout that render drew, captured by a `postLayout` hook (D86: `units: 'cell'`), as the
// flowchart's, ER's and usecase's suites do.
import type { LaidOut } from '@mermaid-js/core';
import type { AgentflowLayout } from '@mermaid-js/diagram-agentflow';
import { createMermaid, type Mermaid, type TextRenderResult } from 'mermaid';

/** The `ascii` config section (DESIGN §6.3). */
export interface AgentflowAsciiOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  maxWidth?: number;
}

export type AgentflowAsciiResult = TextRenderResult & { layout: AgentflowLayout };

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

/** An agentflow source drawn as text through the public API, with its cell layout. */
export async function renderAgentflowAscii(
  text: string,
  options: AgentflowAsciiOptions = {}
): Promise<AgentflowAsciiResult> {
  const m = await instance();
  const call = { format: 'ascii', config: { ascii: { ...options } } } as const;
  await m.prepare(text, call);
  captured = undefined;
  const result = m.renderSync(text, call);
  const laid = captured as LaidOut | undefined;
  if (laid?.kind !== 'graph' || laid.units !== 'cell')
    throw new Error(`no cell layout captured for ${JSON.stringify(text.slice(0, 40))}`);
  return { ...result, layout: laid.layout as AgentflowLayout };
}
