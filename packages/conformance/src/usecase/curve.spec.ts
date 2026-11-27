import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

// `usecase.curve` > `curve` > `curved`, the curve usecase draws today (D733, #1379), through
// `createMermaid().render()`. The fixture sets `curve: linear` and `usecase.curve: step`.
const FIXTURE = join(REPO_ROOT, 'e2e/diagrams/usecase/nightly-check/curve-step.mmd');
const CONFIG = 'config:\n  curve: linear\n  usecase:\n    curve: step\n';

async function render(config: string = CONFIG) {
  const source = await readFile(FIXTURE, 'utf8');
  expect(source).toContain(CONFIG);
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg, warnings } = await m.render('mermaid-0', source.replace(CONFIG, config));
  const lines = [...svg.matchAll(/<path d="([^"]*)"[^>]*fill="none"/g)].map((x) => x[1]!);
  return { lines, warnings };
}

describe('usecase curve config precedence (D733, #1379)', () => {
  it('draws usecase.curve over the top-level curve', async () => {
    const both = await render();
    const own = await render('config:\n  usecase:\n    curve: step\n');
    expect(both.warnings).toEqual([]);
    expect(both.lines.length).toBeGreaterThan(0);
    // Step lines turn at right angles only.
    for (const d of both.lines) expect(d).not.toMatch(/[QAC]/);
    expect(both.lines).toEqual(own.lines);
  });

  it('draws the top-level curve when usecase.curve is unset', async () => {
    const global = await render('config:\n  curve: linear\n');
    const own = await render('config:\n  usecase:\n    curve: linear\n');
    expect(global.warnings).toEqual([]);
    expect(global.lines).toEqual(own.lines);
    expect(global.lines).not.toEqual((await render('')).lines);
  });

  it('draws curved when neither key is set, as before', async () => {
    const unset = await render('');
    const curved = await render('config:\n  usecase:\n    curve: basis\n');
    expect(unset.warnings).toEqual([]);
    expect(unset.lines.some((d) => d.includes('C'))).toBe(true);
    expect(unset.lines).toEqual(curved.lines);
  });

  it('draws an unknown name with the default curve and warns CURVE_UNKNOWN once', async () => {
    const { lines, warnings } = await render('config:\n  usecase:\n    curve: bogus\n');
    const rounded = await render('config:\n  usecase:\n    curve: rounded\n');
    expect(lines).toEqual(rounded.lines);
    const curve = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
    expect(curve).toHaveLength(1);
    expect(curve[0]!.message).toContain('bogus');
  });
});
