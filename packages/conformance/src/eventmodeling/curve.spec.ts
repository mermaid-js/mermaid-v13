import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

// `eventmodeling.curve` > `curve` > today's look (D733, D760, #1380), through
// `createMermaid().render()`. The fixture sets `curve: linear` and `eventmodeling.curve: basis`.
const FIXTURE = join(REPO_ROOT, 'e2e/diagrams/eventmodeling/nightly-check/curve-key.mmd');
const CONFIG = 'config:\n  curve: linear\n  eventmodeling:\n    curve: basis\n';

async function render(config: string = CONFIG) {
  const source = await readFile(FIXTURE, 'utf8');
  expect(source).toContain(CONFIG);
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg, warnings } = await m.render('mermaid-0', source.replace(CONFIG, config));
  const lines = [...svg.matchAll(/<path class="em-relation"[^>]* d="([^"]*)"/g)].map((x) => x[1]!);
  // The fixture's sources include ones the validator rejects, to draw every route.
  return { lines, warnings: warnings.filter((w) => w.code !== 'EVENTMODELING_INVALID_SOURCE') };
}

describe('eventmodeling curve config precedence (D733, D760, #1380)', () => {
  it('draws eventmodeling.curve over the top-level curve', async () => {
    const both = await render();
    const own = await render('config:\n  eventmodeling:\n    curve: basis\n');
    expect(both.warnings).toEqual([]);
    expect(both.lines.length).toBeGreaterThan(0);
    expect(both.lines.some((d) => d.includes('C'))).toBe(true);
    expect(both.lines).toEqual(own.lines);
  });

  it('draws the top-level curve when eventmodeling.curve is unset', async () => {
    const global = await render('config:\n  curve: step\n');
    const own = await render('config:\n  eventmodeling:\n    curve: step\n');
    expect(global.warnings).toEqual([]);
    expect(global.lines).toEqual(own.lines);
    expect(global.lines).not.toEqual((await render('')).lines);
  });

  it("draws today's look when neither key is set: straight lines, no curve", async () => {
    const unset = await render('');
    expect(unset.warnings).toEqual([]);
    expect(unset.lines.length).toBeGreaterThan(0);
    for (const d of unset.lines) expect(d).not.toMatch(/[QAC]/);
    // Not what `linear` draws: its lines stop at the heads' bases.
    expect(unset.lines).not.toEqual((await render('config:\n  curve: linear\n')).lines);
  });

  it('draws an unknown name with the default curve and warns CURVE_UNKNOWN once', async () => {
    const { lines, warnings } = await render('config:\n  eventmodeling:\n    curve: bogus\n');
    const rounded = await render('config:\n  eventmodeling:\n    curve: rounded\n');
    expect(lines).toEqual(rounded.lines);
    const curve = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
    expect(curve).toHaveLength(1);
    expect(curve[0]!.message).toContain('bogus');
  });
});
