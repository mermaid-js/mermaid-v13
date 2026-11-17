import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// Step curves and unknown curve names (#356, D602), through `createMermaid().render()`.
const DIR = join(REPO_ROOT, 'e2e/diagrams/flowchart/baseline/edges');

async function render(name: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const source = await readFile(join(DIR, name), 'utf8');
  const { svg, warnings } = await m.render('mermaid-0', source);
  const paths = [...svg.matchAll(/<path d="([^"]*)" fill="none"/g)].map((x) => x[1]!);
  return { paths, warnings };
}

describe('flowchart step curves', () => {
  it('draw right angles only, and the three variants differ', async () => {
    const drawn = await Promise.all(
      ['curve-step.mmd', 'curve-step-before.mmd', 'curve-step-after.mmd'].map(render)
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

describe('flowchart unknown curve name', () => {
  it('is drawn with S-curves and warns CURVE_UNKNOWN once', async () => {
    const { paths, warnings } = await render('../../nightly-check/curve-unknown.mmd');
    expect(paths.some((d) => d.includes('C'))).toBe(true);
    const curve = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
    expect(curve).toHaveLength(1);
    expect(curve[0]!.message).toContain('bogus');
  });
});
