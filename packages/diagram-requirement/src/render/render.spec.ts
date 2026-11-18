// The requirement renderer (spec #520 T4) through the plugin's own seam: parsed sources laid out
// and drawn with core's render context (`renderRequirementForTest`). Structure and v12's class
// names, `data-ast` (D437), relations, markers and labels, the four families (D152, D215,
// D227), the palette, author styles, the title (D218), the `w.outline` hook (D301, D302) and the
// root. Expected values are what mermaid@12.2.0 draws, rendered in headless Chromium. The corpus
// properties are `conformance/src/requirement/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineDraw } from '@mermaid-js/core/svg';
import { renderRequirementForTest } from './harness.ts';

/** Every `<tag>` start tag's attributes, in document order. */
function elements(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of svg.matchAll(new RegExp(`<(?:${tag})\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g))
      attrs[a[1]!] = a[2]!
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&quot;/g, '"');
    out.push(attrs);
  }
  return out;
}

/**
 * An attribute's value as the theme computed it: `var(--_x)` read through the root's
 * declarations (`--_x:var(--mermaid-name,<fallback>)`) down to a literal, `px` dropped.
 */
function lit(svg: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const style = elements(svg, 'svg')[0]!.style ?? '';
  let v = value;
  for (let i = 0; i < 20; i++) {
    const m = /^var\((--_[\w-]+)\)$/.exec(v);
    if (!m) break;
    const decl = new RegExp(`${m[1]}:var\\(--mermaid-[\\w-]+,(.*?)\\)(?:;--_|$)`).exec(style);
    if (!decl) break;
    v = decl[1]!;
  }
  return v.replace(/px$/, '');
}

const byClass = (svg: string, tag: string, cls: string) =>
  elements(svg, tag).filter((e) => (e.class ?? '').split(' ').includes(cls));

/** `e2e/diagrams/requirement/pr-check/sample.mmd`: three kinds, two elements, four relations. */
const SAMPLE = `requirementDiagram
  requirement test_req {
  id: 1
  text: the test text.
  risk: high
  verifymethod: test
  }
  functionalRequirement test_req2 {
  id: 1.1
  text: the second test text.
  risk: low
  verifymethod: inspection
  }
  performanceRequirement test_req3 {
  id: 1.2
  text: the third test text.
  risk: medium
  verifymethod: demonstration
  }
  element test_entity {
  type: simulation
  }
  element test_entity2 {
  type: word doc
  docRef: reqs/test_entity
  }
  test_entity - satisfies -> test_req2
  test_req - traces -> test_req2
  test_req - contains -> test_req3
  test_req <- copies - test_entity2
`;

const SMALL = `requirementDiagram
requirement a {
  id: 1
  text: the text
}
element b {
}
b - satisfies -> a
a - contains -> b
`;

const render = (src: string, config?: Record<string, unknown>) =>
  renderRequirementForTest(src, config ? { config } : {});

/** The numbers of a path's `d`, in order. */
const nums = (d: string): number[] => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('structure (spec #520 Renderer)', () => {
  it('draws edgePaths, edgeLabels and nodes, one g.node.default per box with data-id and data-ast', async () => {
    const { svg, model } = await render(SAMPLE, { theme: 'default' });
    expect(svg).toMatch(
      /^<svg [^>]*class="mermaid mermaid-requirement requirementDiagram"[^>]*aria-roledescription="requirement"/
    );
    const at = (c: string) => svg.indexOf(`class="${c}"`);
    expect(at('edgePaths')).toBeLessThan(at('edgeLabels'));
    expect(at('edgeLabels')).toBeLessThan(at('nodes'));
    const nodes = byClass(svg, 'g', 'node');
    expect(nodes.map((n) => [n.class, n['data-id'], n['data-ast']])).toEqual([
      ['node default', 'test_req', 'requirement:test_req'],
      ['node default', 'test_req2', 'requirement:test_req2'],
      ['node default', 'test_req3', 'requirement:test_req3'],
      ['node default', 'test_entity', 'element:test_entity'],
      ['node default', 'test_entity2', 'element:test_entity2'],
    ]);
    // One data-ast per box and per relation, nothing else carries one.
    const asts = elements(svg, '[a-z]+').filter((e) => e['data-ast'] !== undefined);
    expect(asts).toHaveLength(model.requirements.length + model.elements.length + 4);
    expect(svg).not.toMatch(/\sid="|undefined|NaN|foreignObject|<marker|<style|data-look/);
  });

  it("writes a box's outline, its lines in order and its divider", async () => {
    const { svg } = await render(SMALL, { theme: 'default' });
    const a = /<g class="node default" data-id="a"[^>]*>(.*?)<\/g><g class="node/.exec(svg)![1]!;
    expect(a).toMatch(/^<rect class="basic label-container outer-path" /);
    expect(
      [...a.matchAll(/<text class="label (\w+)"[^>]*>(.*?)<\/text>/g)].map((m) => m[1])
    ).toEqual(['kind', 'name', 'id', 'text']);
    expect(a).toContain('&lt;&lt;Requirement&gt;&gt;');
    expect(a).toMatch(/<text class="label name"[^>]*><tspan[^>]*font-weight="bold"/);
    expect(a).toMatch(/<g class="divider"><path d="M[^"]*" fill="none" stroke="[^"]+"/);
    // An element with no body: no divider (v12 draws one only under body text).
    const b = /<g class="node default" data-id="b"[^>]*>(.*?)<\/g><\/g>/.exec(svg)![1]!;
    expect(b).not.toContain('divider');
    expect([...b.matchAll(/<text class="label (\w+)"/g)].map((m) => m[1])).toEqual([
      'kind',
      'name',
    ]);
  });

  it('draws relations as dashed or solid relationshipLine paths with data-ast, v12 data-ids and labels on a tag', async () => {
    const { svg } = await render(SMALL, { theme: 'default' });
    const lines = byClass(svg, 'path', 'relationshipLine');
    expect(lines.map((l) => [l.class, l['data-id'], l['data-ast'], l['stroke-dasharray']])).toEqual(
      [
        [
          'edge-thickness-normal edge-pattern-dashed relationshipLine',
          'b-a-0',
          'relation:b->a',
          '10,7',
        ],
        [
          'edge-thickness-normal edge-pattern-solid relationshipLine',
          'a-b-1',
          'relation:a->b',
          undefined,
        ],
      ]
    );
    const labels = byClass(svg, 'g', 'edgeLabel');
    expect(labels.map((l) => Object.keys(l).sort())).toEqual([
      ['class', 'data-id'],
      ['class', 'data-id'],
    ]);
    expect(labels.map((l) => l['data-id'])).toEqual(['b-a-0', 'a-b-1']);
    expect(svg).toMatch(
      /<g class="edgeLabel" data-id="b-a-0"><rect [^>]*fill="var\(--_rqlb\)"[^>]*\/><text[^>]*>&lt;&lt;satisfies&gt;&gt;/
    );
  });

  it('draws each relation label as a tag bordered 1 px solid in the relation colour (D626, D627)', async () => {
    const { svg, layout } = await render(SMALL, {
      theme: 'default',
      themeVariables: { relationColor: '#d6336c' },
    });
    const lines = byClass(svg, 'path', 'relationshipLine');
    const groups = svg.split('<g class="edgeLabel"').slice(1);
    expect(groups).toHaveLength(2);
    groups.forEach((part, i) => {
      const box = elements(part, 'rect')[0]!;
      expect(box.rx).toBe('6');
      expect(box.stroke).toBe(lines[i]!.stroke);
      expect(lit(svg, box.stroke)).toBe('#d6336c');
      expect(box['stroke-width']).toBe('1');
      // The dashed `satisfies` line still borders its label solid.
      expect(box['stroke-dasharray']).toBeUndefined();
      expect(box.class).toBeUndefined();
    });
    expect(lines[0]!['stroke-dasharray']).toBeDefined();
    // The box is the room the layout reserved: the label plus the px labelPatch (D629).
    const label = layout.requirement!.relations.find((r) => r.id === 'relation:b->a')!.label;
    const box = elements(groups[0]!, 'rect')[0]!;
    expect(Number(box.width)).toBeCloseTo(label.width + 16);
    expect(Number(box.height)).toBeCloseTo(label.height + 8);
  });

  it('fills the tag with the background, an author relationLabelBackground still winning (D628)', async () => {
    const plain = await render(SMALL, { theme: 'redux-dark' });
    const box = elements(plain.svg.split('<g class="edgeLabel"')[1]!, 'rect')[0]!;
    expect(lit(plain.svg, box.fill)).toBe(lit(plain.svg, 'var(--_bg)'));
    const own = await render(SMALL, {
      theme: 'default',
      themeVariables: { relationLabelBackground: '#123456' },
    });
    const ownBox = elements(own.svg.split('<g class="edgeLabel"')[1]!, 'rect')[0]!;
    expect(lit(own.svg, ownBox.fill)).toBe('#123456');
  });

  it('puts the chevron tip on the target and the contains circle at the source, outside the boxes', async () => {
    const { svg, layout } = await render(SMALL, { theme: 'default' });
    const route = (id: string) => layout.edges.get(id)!.points;
    const arrow = byClass(svg, 'path', 'requirement_arrow');
    expect(arrow).toHaveLength(1);
    const [b1x, b1y, tx, ty, tx2, ty2, b2x, b2y] = nums(arrow[0]!.d!);
    const tip = route('relation:b->a').at(-1)!;
    expect([tx, ty, tx2, ty2]).toEqual(
      [tip.x, tip.y, tip.x, tip.y].map((v) => Number(v.toFixed(2)))
    );
    // 20 long, 20 across, with v12 classic's 1px stroke.
    expect(Math.hypot((b1x! + b2x!) / 2 - tx!, (b1y! + b2y!) / 2 - ty!)).toBeCloseTo(20, 1);
    expect(Math.hypot(b1x! - b2x!, b1y! - b2y!)).toBeCloseTo(20, 1);
    expect(arrow[0]!['stroke-width']).toBe('1');
    const circle = elements(svg, 'circle');
    expect(circle).toHaveLength(1);
    const start = route('relation:a->b')[0]!;
    expect(
      Math.hypot(Number(circle[0]!.cx) - start.x, Number(circle[0]!.cy) - start.y)
    ).toBeCloseTo(10, 1);
    expect([circle[0]!.r, circle[0]!.fill, circle[0]!['stroke-width']]).toEqual(['9', 'none', '1']);
  });

  it('leaves relations to unknown names undrawn (D434) and draws a self-loop', async () => {
    const { svg } = await render(
      'requirementDiagram\nrequirement a {\n}\na - traces -> ghost\na - refines -> a\n'
    );
    expect(byClass(svg, 'path', 'relationshipLine').map((l) => l['data-ast'])).toEqual([
      'relation:a->a',
    ]);
    // v12 counts the undrawn relation too.
    expect(byClass(svg, 'path', 'relationshipLine')[0]!['data-id']).toBe('a-a-1');
  });

  it('draws two self-loops on one requirement apart, each label clear of the other (#768, D618)', async () => {
    // The issue's source: `contains` and `refines` on one requirement.
    const src = `requirementDiagram
  requirement r {
    id: 1
    text: x
    risk: low
    verifymethod: test
  }
  r - contains -> r
  r - refines -> r
`;
    const { svg, layout } = await render(src, { theme: 'default' });
    const lines = byClass(svg, 'path', 'relationshipLine');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.d).not.toBe(lines[1]!.d);
    const [vx, vy, vw, vh] = elements(svg, 'svg')[0]!.viewBox!.split(' ').map(Number);
    const rects = byClass(svg, 'rect', 'labelBkg').map((r) => {
      const [x, y, w, h] = [r.x, r.y, r.width, r.height].map(Number);
      return { x0: x!, y0: y!, x1: x! + w!, y1: y! + h! };
    });
    expect(rects).toHaveLength(2);
    const [a, b] = rects as [(typeof rects)[0], (typeof rects)[0]];
    expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true);
    for (const r of rects) {
      expect(r.x0).toBeGreaterThanOrEqual(vx!);
      expect(r.y0).toBeGreaterThanOrEqual(vy!);
      expect(r.x1).toBeLessThanOrEqual(vx! + vw!);
      expect(r.y1).toBeLessThanOrEqual(vy! + vh!);
    }
    // One loop out of each side of the box.
    const out = [...layout.edges.values()].map((e) => Math.sign(e.points[1]!.x - e.points[0]!.x));
    expect(out.sort()).toEqual([-1, 1]);
  });
});

describe('the families (D152, D215, D227)', () => {
  const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'] as const;

  it.each(FAMILIES)('matches the %s snapshot', async (theme) => {
    expect((await render(SAMPLE, { theme })).svg).toMatchSnapshot();
  });

  it('matches the palette snapshot (redux-color)', async () => {
    expect((await render(SAMPLE, { theme: 'redux-color' })).svg).toMatchSnapshot();
  });

  it('draws v12 classic geometry in classic themes: 1.3 outlines, 1px lines and markers, no shadow or gradient', async () => {
    const { svg, gradient } = await render(SMALL, { theme: 'forest' });
    expect(gradient).toBe(false);
    const box = byClass(svg, 'rect', 'outer-path')[0]!;
    expect([lit(svg, box['stroke-width']), box.filter]).toEqual(['1.3', undefined]);
    expect(lit(svg, byClass(svg, 'path', 'relationshipLine')[0]!['stroke-width'])).toBe('1');
  });

  it("draws v12 neo in redux and neo: strokeWidth lines and strokes, the 0.8 chevron, the theme's shadow", async () => {
    for (const theme of ['redux', 'neo']) {
      const { svg } = await render(SMALL, { theme, themeVariables: { strokeWidth: 3 } });
      const box = byClass(svg, 'rect', 'outer-path')[0]!;
      expect(lit(svg, box['stroke-width']), theme).toBe('3');
      expect(lit(svg, box.filter), theme).toMatch(/^drop-shadow\(/);
      expect(lit(svg, byClass(svg, 'path', 'relationshipLine')[0]!['stroke-width']), theme).toBe(
        '3'
      );
      const arrow = byClass(svg, 'path', 'requirement_arrow')[0]!;
      const [b1x, b1y, , , , , b2x, b2y] = nums(arrow.d!);
      expect(Math.hypot(b1x! - b2x!, b1y! - b2y!), theme).toBeCloseTo(16, 1);
      expect(arrow['stroke-width'], theme).toBe('2.4');
      expect(elements(svg, 'circle')[0]!['stroke-width'], theme).toBe('3');
    }
  });

  it('strokes the box and its divider with the neo gradient, the rule lifted so it paints (D182, D185)', async () => {
    const { svg, gradient } = await render(SMALL, { theme: 'neo' });
    expect(gradient).toBe('mermaid-0-gradient');
    const box = byClass(svg, 'rect', 'outer-path')[0]!;
    expect(box.stroke).toBe('url(#mermaid-0-gradient)');
    const divider = /<g class="divider"><path d="([^"]*)" fill="none" stroke="([^"]*)"/.exec(svg)!;
    expect(divider[2]).toBe('url(#mermaid-0-gradient)');
    // The rule alone, its right end 0.01 up: a box with a height, which the gradient paints.
    expect(divider[1]!.match(/[ML]/g)).toEqual(['M', 'L']);
    const [, y0, , y1] = nums(divider[1]!);
    expect(y0! - y1!).toBeCloseTo(0.01, 6);
    // Without the gradient (and where a style strokes the box), a level rule.
    for (const [src, theme] of [
      [SMALL, 'redux'],
      [`${SMALL}style a stroke:#ff0000\n`, 'neo'],
    ] as const) {
      const plain = /<g class="divider"><path d="([^"]*)"/.exec(
        (await render(src, { theme })).svg
      )!;
      const [, a, , b] = nums(plain[1]!);
      expect([plain[1]!.match(/[ML]/g), a], theme).toEqual([['M', 'L'], b]);
    }
  });
});

describe('edges follow flowchart.curve (class precedent)', () => {
  /** The path commands of every relation line. */
  const commands = async (curve?: string): Promise<string> =>
    byClass(
      (await render(SAMPLE, curve ? { flowchart: { curve } } : {})).svg,
      'path',
      'relationshipLine'
    )
      .map((l) => l.d!.replace(/[^A-Z]/g, ''))
      .join(' ');

  it('draws linear as straight segments, basis as S-curves, and rounds corners by default', async () => {
    expect(await commands('linear')).toMatch(/^[ML ]+$/);
    const basis = await commands('basis');
    expect(basis).toContain('C');
    expect(basis).not.toContain('A');
    // `rounded` (the default) turns its corners with arcs.
    expect(await commands()).toContain('A');
  });

  it('draws a self-loop with rounded corners whatever the curve', async () => {
    const loop = 'requirementDiagram\nrequirement a {\n}\na - refines -> a\n';
    for (const curve of ['linear', 'basis', 'step']) {
      const { svg } = await render(loop, { flowchart: { curve } });
      const d = byClass(svg, 'path', 'relationshipLine')[0]!.d!;
      expect(d, curve).toContain('A');
      expect(d, curve).not.toContain('C');
    }
  });
});

describe('palette and styles', () => {
  it('colours each box from its palette slot where the theme has one (redux-color), never otherwise', async () => {
    const { svg } = await render(SAMPLE, { theme: 'redux-color' });
    const nodes = byClass(svg, 'g', 'node');
    expect(nodes.map((n) => n['data-color-id'])).toEqual([
      'color-0',
      'color-1',
      'color-2',
      'color-3',
      'color-4',
    ]);
    // v12 redux-color: border #E879F9 and fill #FDF4FF in slot 0.
    const box = byClass(svg, 'rect', 'outer-path')[0]!;
    expect([box.stroke, box.fill].map((v) => lit(svg, v)!.toLowerCase())).toEqual([
      '#e879f9',
      '#fdf4ff',
    ]);
    const plain = await render(SAMPLE, { theme: 'redux' });
    expect(byClass(plain.svg, 'g', 'node').every((n) => n['data-color-id'] === undefined)).toBe(
      true
    );
  });

  it('sends label styles to the text and the rest to the outline, over the palette; classes reach the g', async () => {
    const src = `requirementDiagram
requirement a {
  id: 1
}
element b {
}
classDef hot fill:#ff0000,stroke:#00ff00,color:#0000ff
class a hot
style b stroke-width:4px
`;
    const { svg } = await render(src, { theme: 'redux-color' });
    const nodes = byClass(svg, 'g', 'node');
    expect(nodes.map((n) => n.class)).toEqual(['node default hot', 'node default']);
    const [a, b] = byClass(svg, 'rect', 'outer-path');
    expect([a!.fill, a!.stroke]).toEqual(['#ff0000', '#00ff00']);
    expect(b!['stroke-width']).toBe('4px');
    expect(byClass(svg, 'text', 'name')[0]!.fill).toBe('#0000ff');
  });
});

describe('the title and the root', () => {
  const TITLED = `---\ntitle: A rather long requirement diagram title\n---\nrequirementDiagram\nrequirement a {\n}\n`;

  it('writes the front-matter title as requirementDiagramTitleText above the drawing, inside the viewBox (D218)', async () => {
    const { svg, layout } = await render(TITLED, { theme: 'default' });
    const title = elements(svg, 'text').find((t) => t.class === 'requirementDiagramTitleText')!;
    expect(svg).toContain('>A rather long requirement diagram title</text>');
    const [x, y, w] = elements(svg, 'svg')[0]!.viewBox!.split(' ').map(Number);
    expect(y).toBeLessThan(0);
    // Centred over the layout, wider than it here.
    expect(x).toBeLessThan(0);
    expect(x! + w! / 2).toBeCloseTo(layout.width / 2, 0);
    expect(lit(svg, title.fill)).toBe('#333333');
    const untitled = await render('requirementDiagram\nrequirement a {\n}\n', { theme: 'default' });
    expect(elements(untitled.svg, 'svg')[0]!.viewBox!.startsWith('0 0 ')).toBe(true);
  });

  it('names its title and description by idPrefix, and writes no other id', async () => {
    const src = 'requirementDiagram\naccTitle: Reqs\naccDescr: All of them\nrequirement a {\n}\n';
    const { svg } = await renderRequirementForTest(src, { idPrefix: 'r1' });
    expect(svg).toMatch(/aria-labelledby="r1-title" aria-describedby="r1-desc"/);
    expect([...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1])).toEqual(['r1-title', 'r1-desc']);
  });

  it('sizes to its width with requirement.useMaxWidth off', async () => {
    const on = elements((await render(SMALL)).svg, 'svg')[0]!;
    expect([on.width, on.height]).toEqual(['100%', undefined]);
    const off = elements(
      (await render(SMALL, { requirement: { useMaxWidth: false } })).svg,
      'svg'
    )[0]!;
    expect(Number(off.width)).toBeGreaterThan(0);
    expect(Number(off.height)).toBeGreaterThan(0);
  });
});

describe('the w.outline hook (D301, D302)', () => {
  it('draws boxes, dividers and relation lines through it; markers stay plain', async () => {
    const calls: { role: string; tag: string; attrs: Attrs }[] = [];
    const record: OutlineDraw = (role, tag, attrs) => {
      calls.push({ role, tag, attrs });
      return false;
    };
    const plain = await render(SMALL);
    const r = await renderRequirementForTest(SMALL, { outline: record });
    // A drawer that declines leaves the output byte-identical.
    expect(r.svg).toBe(plain.svg);
    expect(calls.map((c) => `${c.role} ${c.tag}`)).toEqual([
      'edge path',
      'edge path',
      // The label tags' borders (D630).
      'label rect',
      'label rect',
      'node rect',
      'divider path',
      'node rect',
    ]);
    // A drawer that sketches every outline: the markers are still drawn as they were.
    const sketch: OutlineDraw = (_role, _tag, attrs, sink) => {
      sink.leaf('path', {
        class: `sketch ${attrs.class ?? ''}`,
        d: sink.path().moveTo(0, 0).done(),
      });
      return true;
    };
    const drawn = await renderRequirementForTest(SMALL, { outline: sketch });
    expect(byClass(drawn.svg, 'path', 'sketch')).toHaveLength(7);
    expect(elements(drawn.svg, 'rect')).toEqual([]);
    const markers = (s: string) =>
      s.match(/<(?:path|circle)[^>]*requirement_(?:arrow|contains)[^>]*>|<circle[^>]*>/g);
    expect(markers(drawn.svg)).toEqual(markers(plain.svg));
    expect(drawn.svg).toMatchSnapshot();
  });

  it('sketches the outline once and the divider rule alone under neo (D185, D301)', async () => {
    const calls: { role: string; d?: string }[] = [];
    const sketch: OutlineDraw = (role, _tag, attrs, sink) => {
      calls.push({ role, d: attrs.d === undefined ? undefined : String(attrs.d) });
      sink.leaf('path', { class: 'sketch', d: sink.path().moveTo(0, 0).done() });
      return true;
    };
    const drawn = await renderRequirementForTest(SMALL, {
      config: { theme: 'neo' },
      outline: sketch,
    });
    expect(calls.map((c) => c.role)).toEqual([
      'edge',
      'edge',
      'label',
      'label',
      'node',
      'divider',
      'node',
    ]);
    // The divider's path is the rule only: one move, one line, no second outline.
    const divider = calls.find((c) => c.role === 'divider')!.d!;
    expect(divider.match(/[MLZ]/g)).toEqual(['M', 'L']);
    expect(drawn.svg).toMatchSnapshot();
  });
});
