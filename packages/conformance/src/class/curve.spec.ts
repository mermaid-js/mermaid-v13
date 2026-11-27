import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

/**
 * The class edge curve (D733, #1378), through `createMermaid().render()`: `class.curve`, then
 * the top-level `curve`, then `rounded`. `flowchart.curve` no longer reaches class diagrams.
 */
const FIXTURE = join(REPO_ROOT, 'e2e/diagrams/class-diagram/nightly-check/curve-key.mmd');
// The fixture's config block: its own key, and a `flowchart.curve` that must change nothing.
const BLOCK = 'config:\n  class:\n    curve: linear\n  flowchart:\n    curve: basis\n';

/** The fixture with its config block replaced by `config`. */
async function render(config: string) {
  const source = await readFile(FIXTURE, 'utf8');
  expect(source).toContain(BLOCK);
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg, warnings } = await m.render('mermaid-0', source.replace(BLOCK, config));
  const paths = [...svg.matchAll(/<g class="edge relation[^"]*"[^>]*><path d="([^"]*)"/g)].map(
    (x) => x[1]!
  );
  return { paths, warnings };
}

describe('class curve (D733, #1378)', () => {
  it('draws rounded right angles with nothing set', async () => {
    const unset = await render('');
    const rounded = await render('config:\n  curve: rounded\n');
    expect(unset.paths.length).toBeGreaterThan(0);
    expect(unset.paths).toEqual(rounded.paths);
    expect(unset.paths.some((d) => d.includes('A'))).toBe(true);
    expect(unset.warnings).toEqual([]);
  });

  it('draws class.curve, and the top-level curve under it', async () => {
    const unset = await render('');
    const own = await render('config:\n  class:\n    curve: linear\n');
    const global = await render('config:\n  curve: linear\n');
    expect(own.paths).not.toEqual(unset.paths);
    expect(own.paths.every((d) => !/[QAC]/.test(d))).toBe(true);
    expect(global.paths).toEqual(own.paths);
    expect(own.warnings).toEqual([]);
  });

  it('draws class.curve over the top-level curve', async () => {
    const both = await render('config:\n  curve: basis\n  class:\n    curve: linear\n');
    expect(both.paths).toEqual((await render('config:\n  class:\n    curve: linear\n')).paths);
    expect(both.paths).not.toEqual((await render('config:\n  curve: basis\n')).paths);
  });

  it('is not changed by flowchart.curve', async () => {
    const unset = await render('');
    for (const curve of ['linear', 'basis', 'step']) {
      const flowchart = await render(`config:\n  flowchart:\n    curve: ${curve}\n`);
      expect(flowchart.paths, curve).toEqual(unset.paths);
      expect(flowchart.warnings, curve).toEqual([]);
    }
    // The fixture as committed: its `flowchart.curve: basis` changes nothing.
    const fixture = await render(BLOCK);
    expect(fixture.paths).toEqual((await render('config:\n  class:\n    curve: linear\n')).paths);
  });

  it('draws an unknown name with the default curve and warns CURVE_UNKNOWN once', async () => {
    const unset = await render('');
    for (const config of ['config:\n  class:\n    curve: bogus\n', 'config:\n  curve: bogus\n']) {
      const { paths, warnings } = await render(config);
      expect(paths, config).toEqual(unset.paths);
      const curve = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
      expect(curve, config).toHaveLength(1);
      expect(curve[0]!.message).toContain('bogus');
    }
  });
});
