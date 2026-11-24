import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertInert } from '@mermaid-js/core/svg';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

/**
 * Agentflow's animated edges (#1196, D606), through `createMermaid().render()`: the fixture's
 * `animate` and `animation` edges move, and the output stays inert, with no style sheet.
 */
const FIXTURE = join(REPO_ROOT, 'e2e/diagrams/agentflow/visual-check/03-edges.mmd');

const source = () => readFile(FIXTURE, 'utf8');

function mermaid() {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
}

const draw = async () => mermaid().render('mermaid-0', await source());

/** Each animated edge's `data-id` and its seconds per cycle. */
const moving = (svg: string) =>
  [...svg.matchAll(/<g><animate [^>]*dur="(\d+)"[^>]*\/><path [^>]*data-id="([^"]*)"/g)].map(
    (m) => [m[2], Number(m[1])]
  );

describe('agentflow edge animation (#1196, D606)', () => {
  it('moves the edges that ask for it, fast in 20 s and slow in 50 s, and no other', async () => {
    const { svg, warnings } = await draw();
    expect(moving(svg)).toEqual([
      ['e1', 20],
      ['e2', 50],
      ['e3', 20],
    ]);
    expect(svg.match(/<animate\b/g)).toHaveLength(3);
    expect(svg.match(/stroke-dasharray="9,5"/g)).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it('writes inert output with no style sheet (R-SEC-2)', async () => {
    const { svg } = await draw();
    expect(() => assertInert(svg)).not.toThrow();
    expect(svg).not.toContain('<style');
  });

  it('draws the same through prepare() and renderSync()', async () => {
    const text = await source();
    const m = mermaid();
    await m.prepare(text);
    expect(m.renderSync(text).svg).toBe((await draw()).svg);
  });
});
