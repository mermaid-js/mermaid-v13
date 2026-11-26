// The agentflow renderer (spec #523 T4, #548) through the plugin's own seam: parsed sources laid
// out and drawn with core's render context (`renderAgentflowForTest`). Structure and v12's
// classes, the shapes on the layout's outlines (D446), palette slots (v12 `colorSlots.ts`), the
// paints v12.2.0 drew (its computed styles in Chromium, pitfall 17), the gradient (D182), the
// title (D218), links, tooltips and callbacks (D105), math (D176) and the `w.outline` hook
// (D301, D302). The corpus properties are `conformance/src/agentflow/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineDraw } from '@mermaid-js/core/svg';
import { agentflow } from '../plugin.ts';
import { shapeOutline } from '../layout/index.ts';
import { renderAgentflowForTest } from './harness.ts';

/** Every `<tag>` start tag's attributes, in document order. */
function elements(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of svg.matchAll(new RegExp(`<(?:${tag})\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    out.push(attrs);
  }
  return out;
}

const byClass = (svg: string, tag: string, cls: string) =>
  elements(svg, tag).filter((e) => (e.class ?? '').split(' ').includes(cls));

/** The markup of the `g` whose `data-id` is `id`, up to its first nested `</g>`. */
function group(svg: string, id: string): string {
  const at = svg.indexOf(`data-id="${id}"`);
  expect(at, id).toBeGreaterThan(0);
  const start = svg.lastIndexOf('<g ', at);
  return svg.slice(start, svg.indexOf('</g>', at));
}

const EVERY = `agentflow-beta TB
  flow outer["Outer"]
    t1["Tool"]@{ shape: tool }
    t2["Task"]@{ shape: task }
    t3["Decide"]@{ shape: decision }
    t4["In"]@{ shape: input }
    t5["Doc"]@{ shape: refdoc }
    t6["Act"]@{ shape: action }
    t1 --> t2 --> t3
    t3 --x t4
    t4 -.- t5
    t5 --> t6
  end
  flow second["Second"]
    q --> r
  end
  flow coll["Collapsed"]
    s --> u
  end
  coll@{ view: "collapsed" }
  connector llm
  t6 --> llm
  t6 -->|lbl| coll
`;

describe('structure (v12 classes, D468)', () => {
  it('draws clusters, edgePaths, edgeLabels and nodes with v12 classes', async () => {
    const { svg } = await renderAgentflowForTest(EVERY);
    expect(svg).toMatch(
      /^<svg [^>]*class="mermaid mermaid-agentflow"[^>]*role="img"[^>]*aria-roledescription="agentflow"/
    );
    const order = ['class="clusters"', 'class="edgePaths"', 'class="edgeLabels"', 'class="nodes"'];
    const at = order.map((c) => svg.indexOf(c));
    expect(at.every((x) => x > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const frames = byClass(svg, 'g', 'flow-cluster');
    expect(frames.map((f) => [f.class, f['data-id'], f['data-ast']])).toEqual([
      ['cluster flow-cluster', 'outer', 's:outer'],
      ['cluster flow-cluster', 'second', 's:second'],
    ]);
    const kinds = byClass(svg, 'g', 'default').map((g) => [g['data-id'], g.class]);
    expect(Object.fromEntries(kinds)).toMatchObject({
      t1: 'node default af-kind-tool',
      t2: 'node default af-kind-task',
      t3: 'node default af-kind-decision',
      t4: 'node default af-kind-input',
      t5: 'node default af-kind-refdoc',
      t6: 'node default af-kind-action',
      llm: 'node default af-kind-connector',
      q: 'node default af-kind-task',
    });
    // The collapsed flow is a card: a g.node with the flow's AST id, frame, separator, 3 dots.
    const card = group(svg, 'coll');
    expect(card).toMatch(/^<g class="node" data-id="coll" data-ast="s:coll"/);
    expect(byClass(card, 'rect', 'flow-collapsed')).toHaveLength(1);
    expect(byClass(card, 'line', 'collapsed-separator')).toHaveLength(1);
    expect(byClass(card, 'circle', 'collapsed-indicator')).toHaveLength(3);
    // Hidden members of the collapsed flow are not drawn.
    expect(svg).not.toContain('data-id="s"');
  });

  it('puts data-ast on each g.node, flow g.cluster and edge path, and nowhere else', async () => {
    const { svg, layout } = await renderAgentflowForTest(EVERY);
    const tagged = elements(svg, '[a-z]+').filter((e) => e['data-ast'] !== undefined);
    const p = layout.agentflow;
    expect(tagged).toHaveLength(p.nodes.length + p.groups.length + p.edges.length);
    const links = elements(svg, 'path').filter((e) => e['data-ast'] !== undefined);
    expect(links.map((e) => e.class)).toContain(
      'flowchart-link edge-thickness-normal edge-pattern-dotted'
    );
    expect(links.find((e) => e['data-id'] === 'L_t1_t2_0')?.['data-ast']).toBe('e:t1&gt;t2');
    // The edge label carries data-id only.
    expect(byClass(svg, 'g', 'edgeLabel')).toEqual([
      { class: 'edgeLabel', 'data-id': 'L_t6_coll_0' },
    ]);
    expect(svg).not.toMatch(/\sid="|undefined|NaN|data-look|<marker|<defs|foreignObject/);
  });

  it('draws a point head on -->, a cross on --x and none on -.-', async () => {
    const { svg } = await renderAgentflowForTest(`agentflow-beta LR
  a --> b
  c --x d
  e -.- f
`);
    const after = (id: string) => {
      const i = svg.indexOf(`data-id="${id}"`);
      const next = svg.indexOf('data-ast', i + 20);
      return svg.slice(i, next < 0 ? svg.indexOf('</g>', i) : next);
    };
    expect(after('L_a_b_0')).toMatch(/class="marker" d="M[^"]*Z" fill=/);
    expect(after('L_c_d_0')).toMatch(
      /class="marker" d="M[^Z"]*M[^Z"]*" stroke=[^>]*stroke-width="2"/
    );
    expect(after('L_e_f_0')).not.toContain('marker');
  });
});

describe('arrowheads fade with a styled line', () => {
  it('gives a point head and a cross head the line’s colour, opacity and stroke-opacity', async () => {
    const { svg } = await renderAgentflowForTest(`agentflow-beta LR
  a --> b
  c --x d
  linkStyle 0,1 stroke:#ff0000,opacity:0.5,stroke-opacity:0.4
`);
    const [point, cross] = byClass(svg, 'path', 'marker');
    expect(point).toMatchObject({ fill: '#ff0000', opacity: '0.5', 'fill-opacity': '0.4' });
    expect(cross).toMatchObject({ stroke: '#ff0000', opacity: '0.5', 'stroke-opacity': '0.4' });
  });
});

describe('edge animation (#1196, D606)', () => {
  const animate = (seconds: number) =>
    `<animate attributeName="stroke-dashoffset" from="900" to="0" dur="${seconds}" repeatCount="indefinite"/>`;

  /** An animated edge's `<animate>`, its line's start tag and its heads; undefined for any other. */
  function animated(svg: string, id: string) {
    const m = new RegExp(`<g>(<animate [^>]*/>)(<path [^>]*data-id="${id}"[^>]*/>)(.*?)</g>`).exec(
      svg
    );
    return m ? { animate: m[1]!, line: m[2]!, heads: m[3]! } : undefined;
  }

  it('moves an edge with animate or animation: fast in 20 s, slow in 50 s', async () => {
    const { svg, warnings } = await renderAgentflowForTest(`agentflow-beta LR
  a e1@--> b
  b e2@--> c
  c e3@--> d
  e1@{ animate: true }
  e2@{ animation: fast }
  e3@{ animation: slow }
`);
    expect(animated(svg, 'e1')?.animate).toBe(animate(20));
    expect(animated(svg, 'e2')?.animate).toBe(animate(20));
    expect(animated(svg, 'e3')?.animate).toBe(animate(50));
    expect(animated(svg, 'e1')?.line).toContain('edge-animation-fast');
    expect(animated(svg, 'e3')?.line).toContain('edge-animation-slow');
    expect(warnings).toEqual([]);
  });

  it('reads animate: false as v12 did: still alone, animated with an animation', async () => {
    const { svg } = await renderAgentflowForTest(`agentflow-beta LR
  a e1@--> b
  b e2@--> c
  e1@{ animate: false }
  e2@{ animate: false, animation: slow }
`);
    expect(animated(svg, 'e1')).toBeUndefined();
    expect(animated(svg, 'e2')?.animate).toBe(animate(50));
    expect(elements(svg, 'animate')).toHaveLength(1);
  });

  it('gives the line 9,5 dashes and round caps, a dotted one too, and keeps its heads', async () => {
    const { svg } = await renderAgentflowForTest(`agentflow-beta LR
  a e1@--> b
  b e2@--x c
  c e3@-.- d
  e1@{ animate: true }
  e2@{ animate: true }
  e3@{ animate: true }
`);
    for (const id of ['e1', 'e2', 'e3']) {
      const { line, heads } = animated(svg, id)!;
      expect(line, id).toContain('stroke-dasharray="9,5"');
      expect(line, id).not.toContain('stroke-linecap');
      // The dashes are the line's own, never its head's.
      expect(heads, id).not.toContain('stroke-dash');
      expect(elements(heads, 'path'), id).toHaveLength(id === 'e3' ? 0 : 1);
    }
  });

  it('replaces linkStyle dashes, and drops a dash offset that would stop them moving', async () => {
    const { svg } = await renderAgentflowForTest(`agentflow-beta LR
  a e1@--> b
  e1@{ animate: true }
  linkStyle 0 stroke:#ff0000,stroke-dasharray:3 3,stroke-dashoffset:7
`);
    const { line } = animated(svg, 'e1')!;
    expect(line).toContain('stroke="#ff0000"');
    expect(line).toContain('stroke-dasharray="9,5"');
    expect(line).not.toContain('stroke-dashoffset');
  });

  it('draws an edge that does not move as before: no group, its own dashes', async () => {
    const { svg } = await renderAgentflowForTest(`agentflow-beta LR
  a e1@--> b
  c --> d
  e -.- f
  e1@{ animate: true }
`);
    const still = svg.replace(/<g><animate .*?<\/g>/, '');
    expect(still).not.toContain('<g>');
    expect(byClass(still, 'path', 'flowchart-link').map((e) => e['stroke-dasharray'])).toEqual([
      undefined,
      '2',
    ]);
  });

  it('keeps data-id and data-ast on the line, not on its group (D468)', async () => {
    const { svg } = await renderAgentflowForTest(`agentflow-beta LR
  a e1@--> b
  e1@{ animate: true }
`);
    expect(animated(svg, 'e1')?.line).toContain('data-ast="e:a&gt;b"');
    expect(svg.match(/data-id="e1"/g)).toHaveLength(1);
  });
});

describe('shapes on the layout outlines (D446)', () => {
  it('draws each polygon shape with the outline the layout ends edges on', async () => {
    const { svg, layout } = await renderAgentflowForTest(EVERY);
    const p = layout.agentflow;
    for (const id of ['t3', 't4', 't6']) {
      const view = p.views.get(id)!;
      const outline = shapeOutline(view.shape, view.w, view.h, p.geometry);
      const pts = elements(group(svg, id), 'polygon')[0]!.points!.split(/[ ,]/).map(Number);
      const drawn = [];
      for (let i = 0; i < pts.length; i += 2) drawn.push({ x: pts[i]!, y: pts[i + 1]! });
      expect(drawn.length, id).toBe(outline.length);
      drawn.forEach((q, i) => {
        expect(q.x, id).toBeCloseTo(outline[i]!.x, 1);
        expect(q.y, id).toBeCloseTo(outline[i]!.y, 1);
      });
    }
    // The tool's rails are 8 px in; the task box and card take their outline's corner radius.
    const tool = group(svg, 't1');
    const w1 = p.views.get('t1')!.w;
    expect(elements(tool, 'path')[0]!.d).toBe(
      `M${-(w1 / 2 - 8)},-14.05L${-(w1 / 2 - 8)},14.05M${w1 / 2 - 8},-14.05L${w1 / 2 - 8},14.05`
    );
    expect(elements(group(svg, 'coll'), 'rect')[0]!.rx).toBe('10');
    expect(Number(elements(group(svg, 't2'), 'rect')[0]!.rx)).toBe(p.geometry.pads.r);
  });

  it('starts and ends each edge on the outline points the layout gave', async () => {
    const { svg, layout } = await renderAgentflowForTest(EVERY);
    const route = layout.edges.get('L_t4_t5_0')!.points;
    const d = elements(svg, 'path').find((e) => e['data-id'] === 'L_t4_t5_0')!.d!;
    const nums = d.match(/-?[\d.]+/g)!.map(Number);
    // `-.-` has no head, so nothing trims it.
    expect(nums[0]).toBeCloseTo(route[0]!.x, 1);
    expect(nums[1]).toBeCloseTo(route[0]!.y, 1);
    expect(nums.at(-2)).toBeCloseTo(route.at(-1)!.x, 1);
    expect(nums.at(-1)).toBeCloseTo(route.at(-1)!.y, 1);
  });
});

describe('palette slots (v12 colorSlots.ts, D152)', () => {
  // redux-color's palettes, as 12.2.0 drew them (computed styles).
  it('colours each kind from its fixed slot and flows from 7 up in declaration order', async () => {
    const { svg } = await renderAgentflowForTest(EVERY, { config: { theme: 'redux-color' } });
    const outline = (id: string) => {
      const g = group(svg, id);
      const el = elements(g, 'rect|polygon|path')[0]!;
      return [el.stroke, el.fill];
    };
    expect(outline('t1')).toEqual(['#e879f9', '#fdf4ff']);
    expect(outline('t2')).toEqual(['#2dd4bf', '#f0fdfa']);
    expect(outline('t3')).toEqual(['#fb923c', '#fff7ed']);
    expect(outline('t4')).toEqual(['#22d3ee', '#ecfeff']);
    expect(outline('t5')).toEqual(['#4ade80', '#f0fdf4']);
    expect(outline('t6')).toEqual(['#f87171', '#fef2f2']);
    expect(outline('llm')).toEqual(['#a78bfa', '#f5f3ff']);
    const frames = byClass(svg, 'g', 'flow-cluster').map((f) => f['data-color-id']);
    expect(frames).toEqual(['color-7', 'color-8']);
    expect(elements(group(svg, 'outer'), 'rect')[0]).toMatchObject({
      stroke: '#facc15',
      fill: '#fefce8',
    });
    // The collapsed flow keeps its place in the sequence.
    expect(group(svg, 'coll')).toContain('data-color-id="color-9"');
    expect(elements(group(svg, 'coll'), 'rect')[0]).toMatchObject({
      stroke: '#a3e635',
      fill: '#f7fee7',
    });
  });

  it('numbers a parent before the flow nested in it', async () => {
    const { svg } = await renderAgentflowForTest(
      `agentflow-beta TB
  flow outer["Outer"]
    flow inner["Inner"]
      a
    end
  end
  flow sibling["Sibling"]
    b
  end
`,
      { config: { theme: 'redux-color' } }
    );
    const ids = Object.fromEntries(
      byClass(svg, 'g', 'flow-cluster').map((f): [string, string | undefined] => [
        f['data-id']!,
        f['data-color-id'],
      ])
    );
    expect(ids).toEqual({ outer: 'color-7', inner: 'color-8', sibling: 'color-9' });
  });

  it('strokes without filling under redux-dark-color, and is off without a palette', async () => {
    const dark = (await renderAgentflowForTest(EVERY, { config: { theme: 'redux-dark-color' } }))
      .svg;
    expect(elements(group(dark, 't1'), 'rect')[0]).toMatchObject({
      stroke: '#e879f9',
      fill: 'var(--_mb)',
    });
    expect(elements(group(dark, 'outer'), 'rect')[0]).toMatchObject({
      stroke: '#facc15',
      fill: 'none',
    });
    for (const theme of ['redux', 'default', 'neo', 'dark']) {
      const { svg } = await renderAgentflowForTest(EVERY, { config: { theme } });
      expect(svg, theme).not.toContain('data-color-id');
      expect(elements(group(svg, 't1'), 'rect')[0]!.fill, theme).toBe('var(--_mb)');
    }
  });

  it('turns on for an author palette in any theme, and wraps a short one', async () => {
    const { svg } = await renderAgentflowForTest(EVERY, {
      config: {
        theme: 'default',
        themeVariables: { borderColorArray: ['#ff0000', '#00ff00', '#0000ff'] },
      },
    });
    // tool 0, task 1, decision 2, input 3 → 0; flows: 7 + n mod 1 = 7 → 7 mod 3 = 1.
    expect(elements(group(svg, 't1'), 'rect')[0]!.stroke).toBe('#ff0000');
    expect(elements(group(svg, 't4'), 'polygon')[0]!.stroke).toBe('#ff0000');
    expect(byClass(svg, 'g', 'flow-cluster').map((f) => f['data-color-id'])).toEqual([
      'color-1',
      'color-1',
    ]);
  });

  it('wraps a flow slot to a short author palette before it reads bkgColorArray (v12 containerSlot)', async () => {
    const { svg } = await renderAgentflowForTest(EVERY, {
      config: {
        theme: 'redux-color',
        themeVariables: { borderColorArray: ['#ff0000', '#00ff00', '#0000ff'] },
      },
    });
    // Flows: (7 + n mod 1) mod 3 = slot 1 → border #00ff00, redux-color's bkgColorArray[1].
    for (const id of ['outer', 'second'])
      expect(elements(group(svg, id), 'rect')[0], id).toMatchObject({
        stroke: '#00ff00',
        fill: '#f0fdfa',
      });
    expect(group(svg, 'coll')).toContain('data-color-id="color-1"');
    expect(elements(group(svg, 'coll'), 'rect')[0]).toMatchObject({
      stroke: '#00ff00',
      fill: '#f0fdfa',
    });
    // Kinds index both palettes with their own slot: input (3) → border 0, bkgColorArray[3].
    expect(elements(group(svg, 't4'), 'polygon')[0]).toMatchObject({
      stroke: '#ff0000',
      fill: '#ecfeff',
    });
  });

  it("lets the author's style win over the palette", async () => {
    const { svg } = await renderAgentflowForTest(
      `agentflow-beta TB
  a@{ shape: tool }
  style a stroke:#123456
`,
      { config: { theme: 'redux-color' } }
    );
    expect(elements(group(svg, 'a'), 'rect')[0]!.stroke).toBe('#123456');
  });
});

describe('paints as v12.2.0 drew them (pitfall 17)', () => {
  it('frames: nodeBorder, 0.75 px, unfilled, rx 10, with the shadow where the theme has one', async () => {
    const redux = elements(
      group((await renderAgentflowForTest(EVERY, { config: { theme: 'redux' } })).svg, 'outer'),
      'rect'
    )[0]!;
    expect(redux).toMatchObject({
      rx: '10',
      fill: 'none',
      stroke: 'var(--_nb)',
      'stroke-width': '0.75',
      filter: 'var(--_ds)',
    });
    const classic = elements(
      group((await renderAgentflowForTest(EVERY, { config: { theme: 'default' } })).svg, 'outer'),
      'rect'
    )[0]!;
    expect(classic.stroke).toBe('var(--_nb)');
    expect(classic.filter).toBeUndefined();
  });

  it('strokes outlines, frames and the card with the gradient under neo; the refdoc rule plain (D182, D185)', async () => {
    const r = await renderAgentflowForTest(EVERY, { config: { theme: 'neo' } });
    expect(r.gradient).toBe('mermaid-0-gradient');
    const url = 'url(#mermaid-0-gradient)';
    expect(elements(group(r.svg, 't2'), 'rect')[0]!.stroke).toBe(url);
    expect(elements(group(r.svg, 'outer'), 'rect')[0]!.stroke).toBe(url);
    expect(elements(group(r.svg, 'coll'), 'rect')[0]!.stroke).toBe(url);
    const doc = elements(group(r.svg, 't5'), 'path');
    expect(doc[0]!.stroke).toBe(url);
    expect(doc[1]!.stroke).toBe('var(--_nb)');
  });

  it("draws the card's separator in flowContainerStroke and its dots in nodeBorder", async () => {
    const r = await renderAgentflowForTest(EVERY, { config: { theme: 'redux-color' } });
    const sep = elements(group(r.svg, 'coll'), 'line')[0]!;
    expect(sep).toMatchObject({
      stroke: 'var(--_afc)',
      'stroke-dasharray': '3, 3',
      'stroke-width': '0.75',
    });
    expect(r.svg).toMatch(/--_afc:var\(--mermaid-flowContainerStroke,var\(--_sb\)\)/);
    for (const dot of elements(group(r.svg, 'coll'), 'circle'))
      expect(dot).toMatchObject({ fill: 'var(--_nb)', opacity: '0.5', r: '2.5' });
    const own = await renderAgentflowForTest(EVERY, {
      config: { themeVariables: { flowContainerStroke: '#abcdef' } },
    });
    expect(own.svg).toMatch(/--_afc:var\(--mermaid-flowContainerStroke,#abcdef\)/);
  });

  it('has flowContainerStroke on its theme table, ruled by secondaryBorderColor', () => {
    expect(agentflow.theme.vars.flowContainerStroke).toEqual({ alias: 'afc', kind: 'color' });
    expect(agentflow.theme.rules.light.flowContainerStroke).toBe('secondaryBorderColor');
  });
});

describe('title (D218)', () => {
  const titled = (extra = '') => `---
title: My flow
${extra}---
agentflow-beta TB
  a --> b
`;

  it('draws the front-matter title as agentflowTitleText, its baseline titleTopMargin up', async () => {
    const { svg, layout } = await renderAgentflowForTest(titled());
    const [t] = byClass(svg, 'text', 'agentflowTitleText');
    expect(t).toMatchObject({
      'font-size': '18',
      fill: 'var(--_tx)',
      y: '-25',
      'text-anchor': 'middle',
    });
    expect(Number(t!.x)).toBeCloseTo(layout.width / 2, 1);
    expect(svg).toMatch(/>My flow<\/text>/);
    const [, y] = elements(svg, 'svg')[0]!.viewBox!.split(' ').map(Number);
    expect(y).toBeLessThan(-25 - 8);
    const far = await renderAgentflowForTest(
      titled('config:\n  agentflow:\n    titleTopMargin: 60\n')
    );
    expect(byClass(far.svg, 'text', 'agentflowTitleText')[0]!.y).toBe('-60');
  });

  it('draws no title without one, and the viewBox starts at the origin', async () => {
    const { svg } = await renderAgentflowForTest('agentflow-beta TB\n  a --> b\n');
    expect(svg).not.toContain('agentflowTitleText');
    expect(elements(svg, 'svg')[0]!.viewBox).toMatch(/^0 0 /);
  });
});

describe('interactions, math and the root (D105, D176)', () => {
  it('links a click URL, refuses an unsafe one, and draws a tooltip as <title>', async () => {
    const r = await renderAgentflowForTest(`agentflow-beta TB
  a --> b
  click a "https://example.com" "Go"
  click b "javascript:alert(1)"
`);
    expect(group(r.svg, 'a')).toMatch(/<title>Go<\/title><a href="https:\/\/example.com"/);
    expect(group(r.svg, 'b')).not.toContain('<a ');
    expect(r.warnings.map((w) => w.code)).toContain('URL_REFUSED');
  });

  it('draws nothing for a callback: the interactions plugin binds it, and claims it', async () => {
    const src = 'agentflow-beta TB\n  a --> b\n  click a call go()\n';
    const plain = await renderAgentflowForTest(src);
    expect(plain.warnings.map((w) => w.code)).toContain('CALLBACK_IGNORED');
    const claimed = await renderAgentflowForTest(src, { claims: ['callbacks'] });
    expect(claimed.warnings.map((w) => w.code)).not.toContain('CALLBACK_IGNORED');
    expect(claimed.svg).toBe(plain.svg);
    expect(JSON.stringify(claimed.ast)).toContain('"callback":{');
  });

  it('warns MATH_NOT_RENDERED once without a math extension, and lists every label', async () => {
    const src =
      'agentflow-beta TB\n  a["$$x^2$$"] -->|"$$y$$"| b\n  flow f["$$z$$"]\n    c\n  end\n';
    const r = await renderAgentflowForTest(src);
    expect(r.warnings.filter((w) => w.code === 'MATH_NOT_RENDERED')).toHaveLength(1);
    expect(agentflow.labels(r.model)).toEqual(
      expect.arrayContaining(['$$x^2$$', '$$y$$', '$$z$$'])
    );
  });

  it('sizes the root by agentflow.useMaxWidth and is deterministic', async () => {
    const wide = await renderAgentflowForTest(EVERY);
    expect(elements(wide.svg, 'svg')[0]).toMatchObject({ width: '100%' });
    const fixed = await renderAgentflowForTest(EVERY, {
      config: { agentflow: { useMaxWidth: false } },
    });
    const root = elements(fixed.svg, 'svg')[0]!;
    expect(root.height).toBeDefined();
    expect(root.style ?? '').not.toContain('max-width');
    expect((await renderAgentflowForTest(EVERY)).svg).toBe(wide.svg);
  });
});

describe('hand-drawn hook (D301, D302)', () => {
  it('sends shapes, frames, card parts, edges and label boxes through w.outline with their roles', async () => {
    const seen = new Map<string, Set<string>>();
    const record: OutlineDraw = (role, tag, attrs: Attrs) => {
      const key = String(attrs.class ?? tag);
      if (!seen.has(role)) seen.set(role, new Set());
      seen.get(role)!.add(key);
      return false;
    };
    const declined = await renderAgentflowForTest(EVERY, { outline: record });
    expect([...seen.keys()].sort()).toEqual(['divider', 'edge', 'group', 'label', 'mark', 'node']);
    expect(seen.get('group')).toEqual(new Set(['rect']));
    expect(seen.get('label')).toEqual(new Set(['rect']));
    expect(seen.get('mark')).toEqual(new Set(['collapsed-indicator']));
    expect(seen.get('divider')).toEqual(new Set(['path', 'collapsed-separator']));
    expect(seen.get('node')).toEqual(new Set(['rect', 'polygon', 'path', 'flow-collapsed']));
    // A drawer that declines every outline leaves the bytes as they are.
    expect(declined.svg).toBe((await renderAgentflowForTest(EVERY)).svg);
    const sketched = await renderAgentflowForTest(EVERY, {
      outline: (_role, _tag, attrs, sink) => {
        sink.leaf('path', { d: 'M0,0' as never, stroke: attrs.stroke });
        return true;
      },
    });
    expect(sketched.svg).not.toContain('<polygon');
  });
});
