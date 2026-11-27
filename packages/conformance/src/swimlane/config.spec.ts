/**
 * The `swimlane.*` engine keys (#601, D534) through the public `render()`, on their
 * `e2e/diagrams/swimlanes` fixtures: each draws differently from the same source with the key
 * flipped, in the way its description says. And `layout: swimlane` on another graph type (D535),
 * a class diagram in `e2e/diagrams/class-diagram`: its namespaces are laid out as lanes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';

const read = (path: string): string => readFileSync(join(REPO_ROOT, 'e2e/diagrams', path), 'utf8');
const fixture = (name: string): string => read(`swimlanes/pr-check/${name}.mmd`);

async function draw(text: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const r = await m.render('s', text);
  return { ...r, tree: parseSvg(r.svg) };
}

/** `text` with the config line `from` (exactly one, front matter indentation) replaced. */
function flip(text: string, from: string, to: string): string {
  const line = new RegExp(`^ {4}${from}(\r?)$`, 'm');
  expect(text).toMatch(line);
  return text.replace(line, `    ${to}$1`);
}

const classesOf = (tree: SvgView, el: ReturnType<SvgView['find']>[number]): string[] =>
  (tree.getAttr(el, 'class') ?? '').split(' ');

/** Each group's id and first rect, in drawing order, for groups with class `cls`. */
function boxes(tree: SvgView, cls: string) {
  return tree
    .find((n, t) => classesOf(t, n).includes(cls))
    .map((el) => {
      const rect = tree.children(el).find((k) => tree.getAttr(k, 'x') !== undefined)!;
      const at = (k: string) => Number(tree.getAttr(rect, k));
      return { id: tree.getAttr(el, 'data-id')!, x: at('x'), y: at('y'), height: at('height') };
    });
}

/** Every edge line's path data (an edge group's first path; markers follow it), in order. */
const edgePaths = (tree: SvgView): string[] =>
  tree
    .find((n, t) => classesOf(t, n).includes('flowchart-link'))
    .map((el) => tree.getAttr(tree.children(el).find((k) => tree.getAttr(k, 'd'))!, 'd')!);

describe('swimlane.* keys on their fixtures (D534)', () => {
  it('lineHops: gap cuts each crossing; false draws the same routes unbroken', async () => {
    const gap = await draw(fixture('line-hops-gap'));
    const off = await draw(fixture('line-hops-off'));
    expect(gap.warnings).toEqual([]);
    expect(off.warnings).toEqual([]);
    const [g, o] = [edgePaths(gap.tree), edgePaths(off.tree)];
    expect(g).toHaveLength(o.length);
    expect(g.length).toBeGreaterThan(0);
    const moves = (paths: string[]) => paths.join(' ').split('M').length;
    // A gap breaks a run in two: one more move per hop, never an arc.
    expect(moves(g)).toBeGreaterThan(moves(o));
    expect(g.join(' ')).not.toMatch(/A/);
    // The default (`arc`) hops with arcs instead.
    const arc = await draw(flip(fixture('line-hops-off'), 'lineHops: false', 'lineHops: arc'));
    expect(edgePaths(arc.tree).join(' ')).toMatch(/A/);
  });

  it('automaticLaneOrdering: true puts the busy lanes next to each other', async () => {
    const text = fixture('automatic-lane-ordering');
    const across = async (source: string) =>
      boxes((await draw(source)).tree, 'swimlane')
        .sort((a, b) => a.y - b.y)
        .map((l) => l.id);
    expect(await across(text)).toEqual(['Intake', 'Review', 'Delivery', 'Archive', 'Records']);
    const source = flip(text, 'automaticLaneOrdering: true', 'automaticLaneOrdering: false');
    expect(await across(source)).toEqual(['Intake', 'Archive', 'Review', 'Records', 'Delivery']);
  });

  it('ignoreCrossLaneEdges: false ranks with the cross-lane edges', async () => {
    const text = fixture('ignore-cross-lane-edges-off');
    const nodeYs = async (source: string) => {
      const { tree, warnings } = await draw(source);
      expect(warnings).toEqual([]);
      return tree
        .find((n, t) => classesOf(t, n).includes('node'))
        .map((el) => `${tree.getAttr(el, 'data-id')}:${tree.getAttr(el, 'transform')}`);
    };
    const ranked = await nodeYs(text);
    const own = await nodeYs(
      flip(text, 'ignoreCrossLaneEdges: false', 'ignoreCrossLaneEdges: true')
    );
    expect(ranked).toHaveLength(7);
    expect(ranked).not.toEqual(own);
  });
});

describe('swimlane edge curves (D733, #1377)', () => {
  // `line-hops-off` sets `flowchart.curve: linear` and no hops, so only the curve moves paths.
  const text = fixture('line-hops-off');
  const section = '  flowchart:\n    curve: linear\n';
  /** `text` with its `flowchart.curve` replaced by the config lines `lines` (top level). */
  const configured = (lines: string): string => {
    expect(text).toContain(section);
    return text.replace(section, lines);
  };
  const paths = async (source: string) => {
    const { tree, warnings } = await draw(source);
    expect(warnings).toEqual([]);
    return edgePaths(tree);
  };

  // On the swimlane engine's square routes, `step` draws as `linear`; `rounded` adds arcs.
  it('draws swimlane.curve over flowchart.curve', async () => {
    const swimlaneRounded = flip(text, 'lineHops: false', 'lineHops: false\n    curve: rounded');
    const drawn = await paths(swimlaneRounded);
    expect(drawn).toEqual(await paths(flip(text, 'curve: linear', 'curve: rounded')));
    expect(drawn).not.toEqual(await paths(text));
  });

  it('draws the global curve when neither section sets one, and rounded when nothing does', async () => {
    expect(await paths(configured('  curve: linear\n'))).toEqual(await paths(text));
    const rounded = await paths(flip(text, 'curve: linear', 'curve: rounded'));
    expect(await paths(configured(''))).toEqual(rounded);
    expect(rounded).not.toEqual(await paths(text));
  });

  it('draws flowchart.curve over the global curve', async () => {
    const rounded = '  flowchart:\n    curve: rounded\n';
    const drawn = await paths(configured(`  curve: linear\n${rounded}`));
    expect(drawn).toEqual(await paths(configured(rounded)));
    expect(drawn).not.toEqual(await paths(text));
  });
});

describe('swimlane.curve is swimlane-beta’s own key, from any source (D761, #1377)', () => {
  // `line-hops-off`'s diagram without its front matter. Its square routes keep the curves
  // apart: `linear` has corners, `rounded` arcs, `basis` cubics.
  const body = fixture('line-hops-off').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const flowchartBody = body.replace(/^swimlane-beta TD/, 'flowchart TD');
  /** `diagram` with `config` as its front matter (YAML takes JSON), hops off. */
  const source = (diagram: string, config: Record<string, unknown> = {}): string => {
    const swimlane = { lineHops: false, ...(config.swimlane as object | undefined) };
    return `---\nconfig: ${JSON.stringify({ ...config, swimlane })}\n---\n${diagram}`;
  };
  async function paths(text: string, init: Record<string, unknown> = {}) {
    const m = createMermaid();
    m.initialize({ deterministic: true, ...init });
    const r = await m.render('s', text);
    expect(r.warnings).toEqual([]);
    return edgePaths(parseSvg(r.svg));
  }
  const curve = (name: string) => ({ curve: name });
  // The three looks, each from front matter alone.
  const look = async (diagram: string, config: Record<string, unknown> = {}) =>
    paths(source(diagram, config));

  describe('swimlane-beta', () => {
    expect(body).toMatch(/^swimlane-beta TD/);

    it('draws an initialize() swimlane.curve over a front-matter flowchart.curve', async () => {
      const drawn = await paths(source(body, { flowchart: curve('linear') }), {
        swimlane: curve('basis'),
      });
      expect(drawn).toEqual(await look(body, { swimlane: curve('basis') }));
      expect(drawn).not.toEqual(await look(body, { flowchart: curve('linear') }));
    });

    it('draws an initialize() swimlane.curve over a directive flowchart.curve', async () => {
      const directive = `%%{init: {"flowchart": {"curve": "linear"}}}%%\n`;
      const drawn = await paths(source(directive + body), { swimlane: curve('basis') });
      expect(drawn).toEqual(await look(body, { swimlane: curve('basis') }));
    });

    it('draws a front-matter swimlane.curve over an initialize() flowchart.curve', async () => {
      const drawn = await paths(source(body, { swimlane: curve('basis') }), {
        flowchart: curve('linear'),
      });
      expect(drawn).toEqual(await look(body, { swimlane: curve('basis') }));
      expect(drawn).not.toEqual(await look(body, { flowchart: curve('linear') }));
    });

    it('falls to flowchart.curve, then curve, then rounded when swimlane.curve is unset', async () => {
      const linear = await look(body, { flowchart: curve('linear') });
      const basis = await look(body, curve('basis'));
      const rounded = await look(body);
      expect(new Set([linear, basis, rounded].map((p) => p.join('|'))).size).toBe(3);
      expect(await paths(source(body, curve('basis')), { flowchart: curve('linear') })).toEqual(
        linear
      );
      expect(await paths(source(body), curve('basis'))).toEqual(basis);
      expect(rounded).toEqual(await look(body, curve('rounded')));
    });

    it('keeps a per-edge curve above swimlane.curve', async () => {
      const styled = `${body.trimEnd()}\n  linkStyle default interpolate linear\n`;
      const drawn = await paths(source(styled), { swimlane: curve('basis') });
      expect(drawn).toEqual(await look(body, { flowchart: curve('linear') }));
    });
  });

  describe('a flowchart with layout: swimlane ignores swimlane.curve', () => {
    const flow = (config: Record<string, unknown> = {}) =>
      source(flowchartBody, { layout: 'swimlane', ...config });

    it('set in front matter', async () => {
      const rounded = await paths(flow());
      expect(await paths(flow({ swimlane: curve('basis') }))).toEqual(rounded);
      const linear = await paths(flow({ flowchart: curve('linear') }));
      expect(linear).not.toEqual(rounded);
      expect(await paths(flow({ swimlane: curve('basis'), flowchart: curve('linear') }))).toEqual(
        linear
      );
      expect(await paths(flow({ swimlane: curve('basis'), ...curve('linear') }))).toEqual(linear);
    });

    it('set in initialize()', async () => {
      const rounded = await paths(flow());
      expect(await paths(flow(), { swimlane: curve('basis') })).toEqual(rounded);
      const linear = await paths(flow({ flowchart: curve('linear') }));
      expect(await paths(flow(curve('linear')), { swimlane: curve('basis') })).toEqual(linear);
    });
  });

  it('drops a set swimlane.curve from text output only for swimlane-beta', async () => {
    const dropped = async (diagram: string, init: Record<string, unknown>) => {
      const m = createMermaid();
      m.initialize({ deterministic: true, ...init });
      const r = await m.render('s', diagram, { format: 'ascii' });
      return r.warnings.filter((w) => w.code === 'ASCII_DROPPED' && w.feature === 'curve');
    };
    const tiny = 'A --> B';
    expect(await dropped(`swimlane-beta TD\n${tiny}`, { swimlane: curve('basis') })).toHaveLength(
      1
    );
    expect(await dropped(`swimlane-beta TD\n${tiny}`, {})).toEqual([]);
    const lanes = `---\nconfig:\n  layout: swimlane\n---\nflowchart TD\n${tiny}`;
    expect(await dropped(lanes, { swimlane: curve('basis') })).toEqual([]);
  });
});

describe('layout: swimlane on another graph type (D535)', () => {
  it('lays a class diagram out with its namespaces as lanes', async () => {
    const text = read('class-diagram/pr-check/layout-swimlane-namespaces.mmd');
    const r = await draw(text);
    expect(r.diagramType).toBe('classDiagram');
    expect(r.warnings).toEqual([]);
    const lanes = boxes(r.tree, 'namespace');
    expect(lanes.map((l) => l.id)).toEqual(['Domain', 'Infra']);
    // Side by side across a TB flow, stretched to one length.
    const [a, b] = lanes as [(typeof lanes)[0], (typeof lanes)[0]];
    expect(a.y).toBeCloseTo(b.y, 2);
    expect(a.height).toBeCloseTo(b.height, 2);
    expect(b.x).toBeGreaterThan(a.x);
    // Class draws no lanes of its own: lane bands are flowchart's.
    expect(boxes(r.tree, 'swimlane')).toEqual([]);
    expect((await draw(text)).svg).toBe(r.svg);
  });
});
