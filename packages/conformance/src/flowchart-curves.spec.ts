import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// Step curves and unknown curve names (#356, D602, D681), through `createMermaid().render()`.
const DIR = join(REPO_ROOT, 'e2e/diagrams/flowchart/baseline/edges');

async function render(name: string, edit: (source: string) => string = (s) => s) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const source = edit(await readFile(join(DIR, name), 'utf8'));
  const { svg, warnings } = await m.render('mermaid-0', source);
  const paths = [...svg.matchAll(/<path d="([^"]*)" fill="none"/g)].map((x) => x[1]!);
  return { paths, warnings };
}

describe('flowchart step curves', () => {
  it('draw right angles only, and the three variants differ', async () => {
    const drawn = await Promise.all(
      ['curve-step.mmd', 'curve-step-before.mmd', 'curve-step-after.mmd'].map((n) => render(n))
    );
    for (const { paths, warnings } of drawn) {
      expect(paths.length).toBeGreaterThan(0);
      for (const d of paths) expect(d).not.toMatch(/[QAC]/);
      expect(warnings).toEqual([]);
    }
    const joined = drawn.map((d) => d.paths.join('|'));
    expect(new Set(joined).size).toBe(3);
  });
});

describe('flowchart unknown curve name (#1158, D681)', () => {
  it('in the config key is drawn with the default curve and warns CURVE_UNKNOWN once', async () => {
    const fixture = '../../nightly-check/curve-unknown.mmd';
    const { paths, warnings } = await render(fixture);
    const rounded = await render(fixture, (s) => s.replace('curve: bogus', 'curve: rounded'));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toEqual(rounded.paths);
    expect(rounded.warnings).toEqual([]);
    const curve = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
    expect(curve).toHaveLength(1);
    expect(curve[0]!.message).toContain('bogus');
  });

  it('in a per-edge interpolate is drawn with the default curve, not the diagram curve', async () => {
    const fixture = '../../nightly-check/curve-unknown-interpolate.mmd';
    const { paths, warnings } = await render(fixture);
    const rounded = await render(fixture, (s) =>
      s.replace('interpolate bogus', 'interpolate rounded')
    );
    expect(paths.length).toBeGreaterThan(1);
    expect(paths).toEqual(rounded.paths);
    // The other edges keep the diagram's `basis`.
    expect(paths.slice(1).every((d) => d.includes('C'))).toBe(true);
    expect(paths[0]).not.toMatch(/C/);
    const curve = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
    expect(curve).toHaveLength(1);
    expect(curve[0]!.message).toContain('bogus');
  });
});
