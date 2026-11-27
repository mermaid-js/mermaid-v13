import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MermaidConfig } from '@mermaid-js/core/config';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

/**
 * Agentflow's curve (#1181, D687, D733), through `createMermaid().render()`: a per-edge
 * `linkStyle … interpolate`, then `linkStyle default interpolate`, then `agentflow.curve`, then
 * the top-level `curve`, then `rounded`. With none set it is flowchart's default, `rounded`.
 * `flowchart.curve` no longer reaches agentflow diagrams.
 */
const FIXTURE = join(
  REPO_ROOT,
  'e2e/diagrams/agentflow/pr-check/3-should-render-a-decision-with-labeled-branches.mmd'
);

async function render(edit: (source: string) => string = (s) => s, config: MermaidConfig = {}) {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  const { svg, warnings } = await m.render('mermaid-0', edit(await readFile(FIXTURE, 'utf8')));
  const paths = [...svg.matchAll(/<path[^>]*class="flowchart-link[^"]*"[^>]*>/g)].map(
    (x) => /\bd="([^"]*)"/.exec(x[0])![1]!
  );
  return { paths, warnings };
}

const KEY_FIXTURE = join(REPO_ROOT, 'e2e/diagrams/agentflow/nightly-check/curve-key.mmd');

/** The fixture with `line` added at its end. */
const withLine = (line: string) => (s: string) => `${s.trimEnd()}\n  ${line}\n`;

const own = (curve: string): MermaidConfig => ({ agentflow: { curve } }) as MermaidConfig;
const global = (curve: string): MermaidConfig => ({ curve }) as MermaidConfig;
const flowchart = (curve: string): MermaidConfig => ({ flowchart: { curve } }) as MermaidConfig;

describe('agentflow curve with none set (#1181, D687)', () => {
  it('is the default curve, as flowchart draws it', async () => {
    const unset = await render();
    const rounded = await render(undefined, global('rounded'));
    const basis = await render(undefined, own('basis'));
    expect(unset.paths.length).toBe(3);
    // The fixture tells the curves apart: two of its three edges bend.
    expect(basis.paths).not.toEqual(rounded.paths);
    expect(unset.paths).toEqual(rounded.paths);
    expect(unset.warnings).toEqual([]);
  });

  it('leaves an explicit curve as it is', async () => {
    const basis = await render(undefined, own('basis'));
    const linear = await render(undefined, own('linear'));
    expect(basis.paths.filter((d) => d.includes('C')).length).toBeGreaterThan(0);
    expect(linear.paths.every((d) => !/[QAC]/.test(d))).toBe(true);
    // `linkStyle default interpolate` beats `agentflow.curve`.
    const byDefault = await render(withLine('linkStyle default interpolate basis'), own('linear'));
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

describe('agentflow curve config precedence (D733, #1378)', () => {
  it('draws agentflow.curve over the top-level curve, and that over the default', async () => {
    const unset = await render();
    const basis = await render(undefined, own('basis'));
    const both = await render(undefined, { ...global('linear'), ...own('basis') });
    expect(both.paths).toEqual(basis.paths);
    const top = await render(undefined, global('basis'));
    expect(top.paths).toEqual(basis.paths);
    expect(top.paths).not.toEqual(unset.paths);
    expect(both.warnings).toEqual([]);
  });

  it('draws linkStyle default interpolate over agentflow.curve and the top-level curve', async () => {
    const basis = await render(undefined, own('basis'));
    const config = { ...global('linear'), ...own('linear') };
    const byDefault = await render(withLine('linkStyle default interpolate basis'), config);
    expect(byDefault.paths).toEqual(basis.paths);
  });

  it('is not changed by flowchart.curve', async () => {
    const unset = await render();
    for (const curve of ['linear', 'basis', 'step']) {
      const drawn = await render(undefined, flowchart(curve));
      expect(drawn.paths, curve).toEqual(unset.paths);
      expect(drawn.warnings, curve).toEqual([]);
    }
    // The fixture of `curve-key.mmd` sets `flowchart.curve: basis` beside `agentflow.curve`.
    const key = await readFile(KEY_FIXTURE, 'utf8');
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const drawn = await m.render('mermaid-0', key);
    const linear = await render(undefined, own('linear'));
    const paths = [...drawn.svg.matchAll(/<path[^>]*class="flowchart-link[^"]*"[^>]*>/g)].map(
      (x) => /\bd="([^"]*)"/.exec(x[0])![1]!
    );
    expect(paths).toEqual(linear.paths);
  });

  it('draws an unknown name with the default curve and warns CURVE_UNKNOWN once', async () => {
    const unset = await render();
    for (const config of [own('bogus'), global('bogus')]) {
      const { paths, warnings } = await render(undefined, config);
      expect(paths).toEqual(unset.paths);
      const curve = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
      expect(curve).toHaveLength(1);
      expect(curve[0]!.message).toContain('bogus');
    }
  });
});
