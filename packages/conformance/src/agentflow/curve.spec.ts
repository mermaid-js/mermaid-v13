import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FlowchartDiagramConfig } from '@mermaid-js/core/config';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

/**
 * Agentflow's curve with none set (#1181, D687), through `createMermaid().render()`: the same as
 * flowchart's default, `rounded` today. An explicit curve (`flowchart.curve`,
 * `linkStyle default interpolate`, a per-edge `interpolate`) is drawn as before.
 */
const FIXTURE = join(
  REPO_ROOT,
  'e2e/diagrams/agentflow/pr-check/3-should-render-a-decision-with-labeled-branches.mmd'
);

async function render(
  edit: (source: string) => string = (s) => s,
  curve?: FlowchartDiagramConfig['curve']
) {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...(curve === undefined ? {} : { flowchart: { curve } }) });
  const { svg, warnings } = await m.render('mermaid-0', edit(await readFile(FIXTURE, 'utf8')));
  const paths = [...svg.matchAll(/<path[^>]*class="flowchart-link[^"]*"[^>]*>/g)].map(
    (x) => /\bd="([^"]*)"/.exec(x[0])![1]!
  );
  return { paths, warnings };
}

/** The fixture with `line` added at its end. */
const withLine = (line: string) => (s: string) => `${s.trimEnd()}\n  ${line}\n`;

describe('agentflow curve with none set (#1181, D687)', () => {
  it('is the default curve, as flowchart draws it', async () => {
    const unset = await render();
    const rounded = await render(undefined, 'rounded');
    const basis = await render(undefined, 'basis');
    expect(unset.paths.length).toBe(3);
    // The fixture tells the curves apart: two of its three edges bend.
    expect(basis.paths).not.toEqual(rounded.paths);
    expect(unset.paths).toEqual(rounded.paths);
    expect(unset.warnings).toEqual([]);
  });

  it('leaves an explicit curve as it is', async () => {
    const basis = await render(undefined, 'basis');
    const linear = await render(undefined, 'linear');
    expect(basis.paths.filter((d) => d.includes('C')).length).toBeGreaterThan(0);
    expect(linear.paths.every((d) => !/[QAC]/.test(d))).toBe(true);
    // `linkStyle default interpolate` beats `flowchart.curve`.
    const byDefault = await render(withLine('linkStyle default interpolate basis'), 'linear');
    expect(byDefault.paths).toEqual(basis.paths);
    // A per-edge `interpolate` draws that edge only with its curve, through the points the
    // diagram's curve routed (flowchart's rule), so it is not `basis.paths[0]`.
    const perEdge = await render(withLine('linkStyle 0 interpolate basis'));
    const unset = await render();
    expect(perEdge.paths[0]).toContain('C');
    expect(unset.paths[0]).not.toContain('C');
    expect(perEdge.paths.slice(1)).toEqual(unset.paths.slice(1));
  });
});
