import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAgentflow, semanticModel } from '@mermaid-js/diagram-agentflow';
import type { AgentflowSemanticModel } from '@mermaid-js/diagram-agentflow';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { REPO_ROOT } from '../corpus.ts';

/**
 * v12's eight in-tree conformance fixtures (`agentflow/conformance/fixtures/`, `fa796a943`), as
 * `.mmd` files with their `.expected.json` in `e2e/diagrams/agentflow/conformance/` (the parse
 * error in `./fixtures/`: an e2e fixture must render, #550), run as
 * v12's `runner.ts` ran them: the outcome (`parse-error` on an error diagnostic, else `warning`
 * or `valid` by the semantic model's diagnostics), every listed diagnostic present and none
 * other (by id, node and line), and the listed parts of the semantic model (a subset match).
 *
 * The expectations are v12's, but where a decision changes them: `SHAPE_REMOVED` is a warning,
 * so its fixture's outcome is `warning` (D461); the parse error's message is v13's
 * (`Unclosed flow`, R-ERR-5) where v12's was jison's (`Parse error`); and the shape diagnostics name the
 * line of the block that sets the shape, where v12 had no line for them.
 */
const DIRS = [
  join(REPO_ROOT, 'e2e/diagrams/agentflow/conformance'),
  join(REPO_ROOT, 'packages/conformance/src/agentflow/fixtures'),
];

interface Expected {
  outcome: 'valid' | 'warning' | 'error' | 'parse-error';
  diagnostics?: { id: string; nodeId?: string; line?: number }[];
  allowExtraDiagnostics?: boolean;
  parseErrorContains?: string;
  semanticAssertions?: {
    vertices?: { id: string; vertexKind?: string; metadata?: Record<string, unknown> }[];
    edges?: { start?: string; end?: string; id?: string; edgeSemantic?: string }[];
  };
}

interface Found {
  id: string;
  nodeId?: string;
  line: number;
  message: string;
}

function run(source: string): {
  outcome: Expected['outcome'];
  diagnostics: Found[];
  model?: AgentflowSemanticModel;
  error?: string;
} {
  const result = parseAgentflow(source);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) return { outcome: 'parse-error', diagnostics: [], error: error.message };
  const lines = new LineIndex(source);
  const diagnostics = result.model.findings.map((f) => ({
    id: f.id,
    nodeId: f.nodeId,
    line: lines.position(f.range.start).line + 1,
    message: f.message,
  }));
  const model = semanticModel(result.model);
  return { outcome: diagnostics.length > 0 ? 'warning' : 'valid', diagnostics, model };
}

const matches = (d: Found, e: { id: string; nodeId?: string; line?: number }) =>
  d.id === e.id &&
  (e.nodeId === undefined || d.nodeId === e.nodeId) &&
  (e.line === undefined || d.line === e.line);

const cases = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.mmd'))
    .map((f) => [f.slice(0, -'.mmd'.length), dir] as const)
)
  .sort(([a], [b]) => Number(a > b) - Number(a < b))
  .map(([name, dir]) => ({ name, dir }));

describe('agentflow conformance fixtures (v12 conformance/fixtures)', () => {
  it('has the eight fixtures', () => {
    expect(cases).toHaveLength(8);
  });

  it.each(cases)('$name', ({ name, dir }) => {
    const source = readFileSync(join(dir, `${name}.mmd`), 'utf8');
    const expected = JSON.parse(
      readFileSync(join(dir, `${name}.expected.json`), 'utf8')
    ) as Expected;
    const got = run(source);
    expect(got.outcome, got.error).toBe(expected.outcome);
    if (expected.parseErrorContains !== undefined) {
      expect(got.error).toContain(expected.parseErrorContains);
    }
    for (const e of expected.diagnostics ?? []) {
      expect(
        got.diagnostics.some((d) => matches(d, e)),
        JSON.stringify(e)
      ).toBe(true);
    }
    if (expected.diagnostics && !expected.allowExtraDiagnostics) {
      for (const d of got.diagnostics) {
        expect(
          expected.diagnostics.some((e) => matches(d, e)),
          `unexpected ${d.id} on ${d.nodeId}: ${d.message}`
        ).toBe(true);
      }
    }
    const { vertices = [], edges = [] } = expected.semanticAssertions ?? {};
    for (const v of vertices) {
      const actual = got.model?.vertices.find((x) => x.id === v.id);
      expect(actual, v.id).toBeDefined();
      if (v.vertexKind !== undefined) expect(actual?.vertexKind, v.id).toBe(v.vertexKind);
      if (v.metadata !== undefined) expect(actual?.metadata).toMatchObject(v.metadata);
    }
    for (const e of edges) {
      const actual = got.model?.edges.find((x) =>
        e.id !== undefined ? x.id === e.id : x.start === e.start && x.end === e.end
      );
      expect(actual, JSON.stringify(e)).toBeDefined();
      if (e.edgeSemantic !== undefined) expect(actual?.edgeSemantic).toBe(e.edgeSemantic);
    }
  });
});
