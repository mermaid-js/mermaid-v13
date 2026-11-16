/**
 * Render properties (DESIGN §13.2, §13.4) over the e2e swimlanes fixtures (`swimlane-beta`:
 * flowchart's syntax with the swimlane engine, D534), through the public `render()` with
 * `deterministic: true`, two tests per fixture (the engine takes up to ~2.5 s on one layout of
 * `pebr-2-edge-intrudes-lane-label`): render-twice determinism; well-formed XML, the allow-list,
 * no NaN/Infinity/undefined, the viewBox holds every drawn coordinate, and every
 * vertex, edge and subgraph maps to exactly one `data-ast` element whose id resolves to an AST
 * range.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import type { FlowModel } from '@mermaid-js/diagram-flowchart';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';
import { astIndex, drawnExtents, wellFormed } from './svg-props.ts';
import { parseSvg } from './svg-tree.ts';

const DIR = join(REPO_ROOT, 'e2e/diagrams/swimlanes');
const FILES = readdirSync(DIR, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.mmd'))
  .map((f) => f.split('\\').join('/'))
  .sort();

function api() {
  const m = createMermaid();
  // The round trip reads `data-ast`, which a flowchart draws only when asked (R-PARSE-8).
  m.initialize({ deterministic: true, output: { dataAst: true } });
  return m;
}

/** Each fixture's first render, for the determinism test after it. */
const first = new Map<string, string>();

describe('swimlane render properties over the e2e corpus', () => {
  it('has fixtures', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FILES)('%s', async (file) => {
    const source = readFileSync(join(DIR, file), 'utf8');
    const m = api();
    const prepared = await m.prepare(source, { id: 'mermaid-0' });
    expect(prepared.diagramType).toBe('swimlane');
    const { svg } = m.renderSync(source, { id: 'mermaid-0' });

    expect(wellFormed(svg)).toBeUndefined();
    const auto = String(prepared.config.theme) === 'auto';
    expect(() => assertInert(svg, { themeStyle: auto })).not.toThrow();
    first.set(file, svg);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);

    const tree = parseSvg(svg);
    const root = tree.find({ tag: 'svg' })[0]!;
    const [, , w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
    const out = drawnExtents(tree).filter(
      (p) => p.x < -0.5 || p.y < -0.5 || p.x > w! + 0.5 || p.y > h! + 0.5
    );
    expect(out.slice(0, 3)).toEqual([]);

    const model = prepared.parse.model as FlowModel;
    const index = astIndex(prepared.parse.ast);
    const seen = new Map<string, number>();
    for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
      const id = tree.getAttr(el, 'data-ast')!;
      seen.set(id, (seen.get(id) ?? 0) + 1);
      const node = index.get(id);
      expect(node, `${id} is not an AST id`).toBeDefined();
      expect(node!.range.end, id).toBeGreaterThanOrEqual(node!.range.start);
      expect(node!.range.end, id).toBeLessThanOrEqual(source.length);
    }
    for (const [id, n] of seen) expect(n, `${id} appears ${n} times`).toBe(1);
    if (model.subgraphs.some((s) => s.metadata?.view === 'collapsed')) return;
    const subgraphIds = new Set(model.subgraphs.map((s) => s.id));
    for (const v of model.vertices)
      if (!subgraphIds.has(v.id)) expect(seen.get(v.ast), `vertex ${v.id}`).toBe(1);
    for (const s of model.subgraphs) expect(seen.get(s.ast), `subgraph ${s.id}`).toBe(1);
    for (const e of model.edges) expect(seen.get(e.ast), `edge ${e.id}`).toBe(1);
  });

  it.each(FILES)('%s is deterministic: a fresh API object renders the same bytes', async (file) => {
    const source = readFileSync(join(DIR, file), 'utf8');
    const svg = first.get(file) ?? (await api().render('mermaid-0', source)).svg;
    expect((await api().render('mermaid-0', source)).svg).toBe(svg);
  });
});
