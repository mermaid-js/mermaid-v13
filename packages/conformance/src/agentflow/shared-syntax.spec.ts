import { describe, expect, it } from 'vitest';
import { parseAgentflow } from '@mermaid-js/diagram-agentflow';
import { parseFlowchart } from '@mermaid-js/diagram-flowchart';
import { loadOracle } from '../oracle.ts';

/**
 * D595 (amending D467): agentflow's lexer and parser are a dialect of the flow family's, which
 * agentflow shares with flowchart through `@mermaid-js/shared/parser/flow`, and the two must not
 * drift apart where the two grammars are the same. v12's `agentflow-flowchart-parity.spec.ts` fed
 * its `SHARED_SYNTAX` bodies to both v12 parsers; this test-only spec feeds them to both v13
 * parsers (and each type to mermaid\@12), which must agree on accept/reject and, where both
 * accept, on the vertices and edges they read.
 */
const SHARED_SYNTAX = [
  '  A@{ label: "hello" }',
  '  A@{ shape: rect }',
  '  A@{ label: a^b }',
  '  A@{\n    label: "multi"\n  }',
  '  A["Label"] --> B["Other"]',
  '  A -- text --> B',
  '  A["a (paren) b"]',
];

const agentflow = (body: string) => parseAgentflow(`agentflow-beta TB\n${body}\n`);
const flowchart = (body: string) => parseFlowchart(`flowchart TB\n${body}\n`);
const accepted = (r: { diagnostics: readonly { severity: string }[] }) =>
  !r.diagnostics.some((d) => d.severity === 'error');

describe('agentflow / flowchart parser parity (D467, D595)', () => {
  it.each(SHARED_SYNTAX)('agrees on %j', async (body) => {
    const a = agentflow(body);
    const f = flowchart(body);
    expect(accepted(a)).toBe(accepted(f));
    const oracle = await loadOracle();
    expect((await oracle.parse(`agentflow-beta TB\n${body}\n`)).accepted).toBe(accepted(a));
    expect((await oracle.parse(`flowchart TB\n${body}\n`)).accepted).toBe(accepted(f));
    if (!accepted(a)) return;
    expect(a.model.vertices.map((v) => [v.id, v.text, v.labelType])).toEqual(
      f.model.vertices.map((v) => [v.id, v.text, v.labelType])
    );
    expect(a.model.edges.map((e) => [e.id, e.start, e.end, e.text])).toEqual(
      f.model.edges.map((e) => [e.id, e.start, e.end, e.text])
    );
  });

  it('rejects a caret in shape data exactly like flowchart does', () => {
    // `<shapeData>[^}^"]+`: agentflow once used `[^}"]+`, which accepted `A@{ label: a^b }`
    // where flowchart raises a lexical error.
    expect(accepted(agentflow('  A@{ label: a^b }'))).toBe(false);
    expect(accepted(flowchart('  A@{ label: a^b }'))).toBe(false);
  });
});
