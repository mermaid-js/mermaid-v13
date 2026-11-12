// #688: a transition between a composite state and its own child, written inside the composite,
// under ELK. The state model filed the composite under itself, and the adapter's walks up the
// group tree never ended on that loop: a synchronous hang, which no in-process timeout can stop.
// So the fixtures are rendered in a child process, which is killed if it does not answer; the
// time allowed is a watchdog for a loop that never ends, not a speed limit.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LayoutGraph } from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import { toElkGraph } from './adapter.ts';
import elkLayouts from './index.ts';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));
const DIR = fileURLToPath(
  new URL('../../../e2e/diagrams/state-diagram-v2/nightly-check/elk/', import.meta.url)
);
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.startsWith('elk-transition-') && f.endsWith('.mmd'))
  .sort();
const WATCHDOG = 120_000;

// Renders the file named on the command line through the public API and prints the SVG.
const CHILD = `
import { readFileSync } from 'node:fs';
import { createMermaid } from 'mermaid';
import elkLayouts from './src/index.ts';
const m = createMermaid();
m.initialize({ deterministic: true });
m.registerLayoutLoaders(elkLayouts);
const { svg } = await m.render('d', readFileSync(process.argv[1], 'utf8'));
process.stdout.write(svg);
`;

/** The child's stdout, or a rejection when it fails or is still running after `WATCHDOG`. */
function renderInChild(file: string): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--conditions=mermaid-source', '--input-type=module', '-e', CHILD, file],
      { cwd: PACKAGE }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c));
    const timer = setTimeout(() => child.kill('SIGKILL'), WATCHDOG);
    child.on('error', fail);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) done(stdout);
      else fail(new Error(signal ? `the render never returned (${signal})` : stderr));
    });
  });
}

/** The path data of every transition's line, in document order. */
const lines = (svg: string): string[] =>
  [...svg.matchAll(/<g class="transition [^>]*><path d="([^"]+)"/g)].map((m) => m[1]!);

const spacing = { node: 50, rank: 50, edge: 20 };
const pad = { top: 8, right: 8, bottom: 8, left: 8 };

describe('a transition between a composite and its own child under ELK (#688)', () => {
  it('has the fixtures', () => {
    expect(FIXTURES).toHaveLength(3);
  });

  it.concurrent.each(FIXTURES)(
    '%s renders, with the transition drawn',
    async (file) => {
      const svg = await renderInChild(DIR + file);
      expect(svg).toContain('<svg');
      expect(lines(svg)).toHaveLength(1);
    },
    WATCHDOG + 30_000
  );

  it('draws the same whether the transition is written inside the composite or after it', async () => {
    const api = () => {
      const m = createMermaid();
      m.initialize({ deterministic: true });
      m.registerLayoutLoaders(elkLayouts);
      return m;
    };
    const inside = readFileSync(
      `${DIR}elk-transition-from-a-composite-to-its-own-child.mmd`,
      'utf8'
    );
    const after = inside.replace('    Boot --> Running\n  }\n', '  }\n  Boot --> Running\n');
    expect(after).not.toBe(inside);
    expect((await api().render('d', after)).svg).toBe((await api().render('d', inside)).svg);
  });
});

// The flowchart's subgraphs keep the tree they are declared in, so the same edge never looped
// there; it is drawn by ELK as well.
describe('an edge between a subgraph and its own node under ELK', () => {
  it('renders, written inside the subgraph, in either direction', async () => {
    for (const edge of ['S --> A', 'A --> S']) {
      const m = createMermaid();
      m.initialize({ deterministic: true });
      m.registerLayoutLoaders(elkLayouts);
      const { svg } = await m.render(
        'd',
        `---\nconfig:\n  layout: elk\n---\nflowchart TB\n  subgraph S\n    A\n    ${edge}\n  end\n`
      );
      expect(svg.match(/<g class="edge[ "]/g)).toHaveLength(1);
    }
  });
});

describe('a group tree with a loop (#688)', () => {
  const looped = (parents: Record<string, string>): LayoutGraph => ({
    direction: 'TB',
    spacing,
    nodes: [{ id: 'A', width: 40, height: 20, parent: 'G' }],
    edges: [{ id: 'e', source: 'G', target: 'A', minLen: 1 }],
    groups: ['G', 'H'].map((id) => ({
      id,
      padding: pad,
      ...(parents[id] ? { parent: parents[id] } : {}),
    })),
  });

  it('is refused by name, not walked for ever', () => {
    expect(() => toElkGraph(looped({ G: 'G' }), 'layered')).toThrow(
      "layout: group 'G' is inside itself"
    );
    expect(() => toElkGraph(looped({ G: 'H', H: 'G' }), 'layered')).toThrow(
      "layout: group 'G' is inside itself"
    );
  });

  it('accepts a tree', () => {
    expect(() => toElkGraph(looped({ G: 'H' }), 'layered')).not.toThrow();
  });
});
