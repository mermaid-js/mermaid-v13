// The C4 renderer (spec #522 T4) through the plugin's own seam: parsed sources laid out and
// drawn with core's render context (`renderC4ForTest`). Structure and classes (D458), the five
// shapes on their laid-out boxes (D446), colours from config, `Update*Style` and the theme table
// (D456) through the colour check (`C4_COLOR_INVALID`), relations with inline arrowheads and
// their `<title>` (D455), the root, and the `w.outline` hook (D301). The corpus properties are
// `conformance/src/c4/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { OutlineDraw, OutlineRole } from '@mermaid-js/core/svg';
import { C4_COLOR_INVALID } from '../codes.ts';
import { c4 } from '../plugin.ts';
import { renderC4ForTest } from './harness.ts';

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

const hasClass = (e: Record<string, string>, cls: string): boolean =>
  (e.class ?? '').split(' ').includes(cls);
const byClass = (svg: string, tag: string, cls: string) =>
  elements(svg, tag).filter((e) => hasClass(e, cls));
/** The markup of the first `<g …>` whose start tag holds `attr`, to its matching `</g>`. */
function group(svg: string, attr: string): string {
  const start =
    new RegExp(`<g\\b[^>]*${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(svg)?.index ?? -1;
  expect(start, attr).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (const m of svg.slice(start).matchAll(/<g\b[^>]*?(\/?)>|<\/g>/g)) {
    if (m[0] === '</g>') depth--;
    else if (m[1] !== '/') depth++;
    if (depth === 0) return svg.slice(start, start + m.index + m[0].length);
  }
  throw new Error(`unclosed ${attr}`);
}

/** The element ids written (`id=`, not `data-id=`). */
const ids = (svg: string): string[] =>
  [...svg.matchAll(/(?<![\w-])id="([^"]*)"/g)].map((m) => m[1]!);

const CONTEXT = `C4Context
title System Context
accTitle: Banking
accDescr: The bank's context
Person(customer, "Customer", "A customer of the bank")
Person_Ext(other, "Other")
Enterprise_Boundary(b0, "Bank") {
  System(sys, "Banking System", "Handles accounts")
  SystemDb(db, "Database")
}
Rel(customer, sys, "Uses", "HTTPS")
BiRel(sys, db, "Reads and writes")
Rel_Back(other, customer, "Calls")`;

describe('structure (spec #522 Renderer, D458)', () => {
  it('draws the title, then boundaries, elements and relations, each with data-id and data-ast', async () => {
    const { svg, layout } = await renderC4ForTest(CONTEXT);
    const order = ['class="c4-title"', 'class="c4-boundaries"', 'class="c4-elements"'];
    order.push('class="c4-relations"');
    const at = order.map((s) => svg.indexOf(s));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(elements(svg, 'g').filter((g) => g['data-ast'] !== undefined)).toEqual([
      { class: 'c4-boundary', 'data-id': 'b0', 'data-ast': 'boundary:b0' },
      ...layout.elements.map((e) => ({
        class: `node c4-shape c4-${e.kind}${e.kind.startsWith('external_') ? ' c4-external' : ''}`,
        'data-id': e.alias,
        'data-ast': e.ast,
      })),
    ]);
    // Relations: data-ast on the path only; their text carries data-id.
    expect(byClass(svg, 'path', 'c4-rel').map((p) => [p['data-ast'], p['data-id']])).toEqual([
      ['rel:customer-&gt;sys', 'customer-&gt;sys'],
      ['rel:sys-&gt;db', 'sys-&gt;db'],
      ['rel:other-&gt;customer', 'other-&gt;customer'],
    ]);
    for (const t of elements(svg, 'text')) expect(t['data-ast']).toBeUndefined();
  });

  it('writes v12’s element classes and text sections, the external kinds marked', async () => {
    const { svg } = await renderC4ForTest(CONTEXT);
    const person = group(svg, 'class="node c4-shape c4-person"');
    expect(byClass(person, 'text', 'c4-name')).toHaveLength(1);
    expect(byClass(person, 'text', 'c4-type')).toHaveLength(1);
    expect(byClass(person, 'text', 'c4-descr')).toHaveLength(1);
    expect(person).toContain('>[Person]<');
    expect(person).toContain('font-weight="bold">Customer<');
    const other = group(svg, 'class="node c4-shape c4-external_person c4-external"');
    expect(byClass(other, 'text', 'c4-descr')).toHaveLength(0);
    expect(svg).toContain('>[Software System]<');
  });

  it('writes the accessible title and description, and only their ids', async () => {
    const { svg } = await renderC4ForTest(CONTEXT, { idPrefix: 'd' });
    expect(svg).toContain('aria-labelledby="d-title" aria-describedby="d-desc"');
    expect(svg).toMatch(
      /<title id="d-title">Banking<\/title><desc id="d-desc">The bank\S* context<\/desc>/
    );
    expect(ids(svg)).toEqual(['d-title', 'd-desc']);
    expect(byClass(svg, 'text', 'c4-title')).toHaveLength(1);
    expect(svg).toContain('>System Context</text>');
  });

  it('writes no title, description or ids when the diagram has none', async () => {
    const { svg } = await renderC4ForTest('C4Context\nPerson(a, "A")');
    expect(ids(svg)).toEqual([]);
    expect(svg).not.toMatch(/<title|<desc|aria-labelledby|c4-title/);
  });

  it('sizes the viewBox to the layout’s canvas, and follows c4.useMaxWidth', async () => {
    const { svg, layout } = await renderC4ForTest(CONTEXT);
    const [root] = elements(svg, 'svg');
    const w = Math.ceil(layout.width);
    const h = Math.ceil(layout.height);
    expect(root).toMatchObject({ viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img' });
    expect(root!['aria-roledescription']).toBe('c4');
    expect(root!.style).toContain(`max-width:${w}px`);
    const fixed = await renderC4ForTest(CONTEXT, { config: { c4: { useMaxWidth: false } } });
    expect(elements(fixed.svg, 'svg')[0]).toMatchObject({ width: String(w), height: String(h) });
  });
});

describe('the five shapes on their laid-out boxes (D446)', () => {
  const SHAPES = `C4Container
Person(p, "P")
Container(r, "R")
ContainerDb(c, "C")
ContainerQueue(q, "Q")
Container(f, "F", $tags="component")`;

  it('draws each outline as the layout’s outline, inner lines as dividers', async () => {
    const roles: [string, OutlineRole, string][] = [];
    const outline: OutlineDraw = (role, tag, attrs) => {
      roles.push([String(attrs.class ?? ''), role, tag]);
      return false;
    };
    const { svg, layout } = await renderC4ForTest(SHAPES, { outline });
    const box = (alias: string) => layout.elements.find((e) => e.alias === alias)!.box;
    const at = (alias: string) => group(svg, `class="node c4-shape c4-${alias}"`);
    const num = (v: string | undefined): number => Number(v);

    const p = box('p');
    const person = group(svg, 'class="node c4-shape c4-person"');
    const [body] = elements(person, 'rect');
    const close = (got: number[], want: number[]): void =>
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 1));
    // The figure (#683): head radius 0.23 × the width (16 to 80), overlapping the body by 0.27
    // of itself.
    const radius = Math.min(80, Math.max(16, p.width * 0.23));
    const neck = 2 * radius - 0.27 * radius;
    close([body!.x, body!.y, body!.width, body!.height, body!.rx].map(num), [
      p.x,
      p.y + neck,
      p.width,
      p.height - neck,
      12,
    ]);
    const [head] = elements(person, 'circle');
    close([head!.cx, head!.cy, head!.r].map(num), [p.x + p.width / 2, p.y + radius, radius]);

    const r = box('r');
    const [rounded] = elements(at('container'), 'rect');
    expect([rounded!.x, rounded!.width, rounded!.rx].map(num)).toEqual([r.x, r.width, 12]);

    // `fr-rect`: v12's square subroutine, frame lines 8 in.
    const f = box('f');
    const fr = group(svg, 'data-id="f"');
    const [square] = elements(fr, 'rect');
    expect(square!.rx).toBeUndefined();
    const coords = (d: string): number[] => d.split(/[ML,]/).filter(Boolean).map(Number);
    const bottom = f.y + f.height;
    coords(elements(fr, 'path')[0]!.d!).forEach((v, k) =>
      expect(v).toBeCloseTo(
        [f.x + 8, f.y, f.x + 8, bottom, f.x + f.width - 8, f.y, f.x + f.width - 8, bottom][k]!,
        1
      )
    );
    expect(group(svg, 'data-id="c"')).toMatch(/<path class="label-container"[^>]*d="M[^"]*A/);
    expect(group(svg, 'data-id="q"')).toMatch(/<path class="label-container"[^>]*d="M[^"]*A/);

    expect(roles.filter(([, role]) => role === 'node').map(([, , tag]) => tag)).toEqual([
      'rect',
      'circle',
      'rect',
      'path',
      'path',
      'rect',
    ]);
    // The cylinder's and the queue's rim, fr-rect's frame lines.
    expect(roles.filter(([, role]) => role === 'divider')).toHaveLength(3);
  });

  it('keeps every outline inside the element’s box, so ends lie on what is drawn', async () => {
    const { layout } = await renderC4ForTest(
      `${SHAPES}\nRel(p, r, "a")\nRel(r, c, "b")\nRel(c, q, "c")\nRel(q, f, "d")`
    );
    for (const rel of layout.relations) {
      const from = layout.elements.find((e) => e.alias === rel.from)!.box;
      const to = layout.elements.find((e) => e.alias === rel.to)!.box;
      const inside = (pt: { x: number; y: number }, b: typeof from) =>
        pt.x >= b.x - 0.01 &&
        pt.x <= b.x + b.width + 0.01 &&
        pt.y >= b.y - 0.01 &&
        pt.y <= b.y + b.height + 0.01;
      expect(inside(rel.start, from), `${rel.from}`).toBe(true);
      expect(inside(rel.end, to), `${rel.to}`).toBe(true);
    }
  });
});

describe('element colours: config, UpdateElementStyle and the colour check', () => {
  it('fills and strokes with v12’s palette by kind, text #FFFFFF, 2px outlines', async () => {
    const { svg } = await renderC4ForTest(CONTEXT);
    const fills = (alias: string) => {
      const g = group(svg, `data-id="${alias}" data-ast`);
      return [elements(g, 'rect|path')[0], elements(g, 'text')[0]!.fill];
    };
    expect(fills('customer')).toEqual([
      expect.objectContaining({ fill: '#08427B', stroke: '#073B6F', 'stroke-width': '2' }),
      '#FFFFFF',
    ]);
    expect(fills('other')[0]).toMatchObject({ fill: '#686868', stroke: '#8A8A8A' });
    expect(fills('sys')[0]).toMatchObject({ fill: '#1168BD', stroke: '#3C7FC0' });
  });

  it('takes the config’s colours, and UpdateElementStyle’s over them', async () => {
    const src = `C4Context\nPerson(a, "A")\nPerson(b, "B")\nUpdateElementStyle(b, $bgColor="grey", $fontColor="red", $borderColor="#123456")`;
    const { svg, warnings } = await renderC4ForTest(src, {
      config: { c4: { person_bg_color: 'rgb(1, 2, 3)', person_border_color: 'teal' } },
    });
    expect(warnings).toEqual([]);
    const a = group(svg, 'data-id="a" data-ast');
    expect(elements(a, 'rect')[0]).toMatchObject({ fill: 'rgb(1, 2, 3)', stroke: 'teal' });
    const b = group(svg, 'data-id="b" data-ast');
    expect(elements(b, 'rect')[0]).toMatchObject({ fill: 'grey', stroke: '#123456' });
    expect(elements(b, 'text').map((t) => t.fill)).toEqual(['red', 'red']);
  });

  it('drops a colour the check refuses and draws the default, with one C4_COLOR_INVALID naming each', async () => {
    const src = `C4Context
Person(a, "A")
System(s, "S")
Rel(a, s, "uses")
UpdateElementStyle(a, $bgColor="red;stroke:url(javascript:alert(1))", $fontColor="expression(x)")
UpdateRelStyle(a, s, $lineColor="url(#x)")`;
    const { svg, warnings } = await renderC4ForTest(src, {
      config: { c4: { system_bg_color: 'url(https://x)' } },
    });
    expect(svg).not.toMatch(/javascript|expression|url\(/);
    expect(warnings).toHaveLength(1);
    const [w] = warnings;
    expect(w!.code).toBe(C4_COLOR_INVALID);
    expect(w!.message).toContain('$bgColor of a');
    expect(w!.message).toContain('$fontColor of a');
    expect(w!.message).toContain('$lineColor of a -> s');
    expect(w!.message).toContain('c4.system_bg_color "url(https://x)"');
    expect(w!.astIds).toEqual(['element:a', 'rel:a->s']);
    expect(w!.path).toBe('c4.system_bg_color');
    expect(elements(group(svg, 'data-id="a" data-ast'), 'rect')[0]!.fill).toBe('#08427B');
    expect(elements(group(svg, 'data-id="s" data-ast'), 'rect')[0]!.fill).toBe('#1168BD');
    expect(byClass(svg, 'path', 'c4-rel')[0]!.stroke).toBe('var(--_c4r)');
  });
});

describe('boundaries', () => {
  it('draws a dashed frame (solid for a deployment node), rx 2.5, its header in c4BoundaryColor', async () => {
    const src = `C4Deployment
Deployment_Node(n, "Node", "Ubuntu") {
  Boundary(b, "Boundary", "TYPE") {
    Container(c, "C")
  }
}
UpdateElementStyle(b, $bgColor="lightyellow", $borderColor="green", $fontColor="red")`;
    const { svg } = await renderC4ForTest(src);
    const node = group(svg, 'class="c4-boundary c4-deployment-node"');
    expect(elements(node, 'rect')[0]).toMatchObject({
      rx: '2.5',
      fill: 'none',
      stroke: 'var(--_c4b)',
    });
    expect(elements(node, 'rect')[0]!['stroke-dasharray']).toBeUndefined();
    const b = group(svg, 'class="c4-boundary" data-id="b"');
    expect(elements(b, 'rect')[0]).toMatchObject({
      fill: 'lightyellow',
      stroke: 'green',
      'stroke-dasharray': '7 7',
      'stroke-width': '1',
    });
    // v12 never drew a boundary's `$fontColor`.
    expect(elements(b, 'text').map((t) => [t.class, t.fill])).toEqual([
      ['c4-boundary-label', 'var(--_c4b)'],
      ['c4-boundary-type', 'var(--_c4b)'],
    ]);
    expect(b).toContain('>[TYPE]<');
  });
});

describe('relations (D455)', () => {
  it('draws inline arrowheads, none as <marker>: at the end, at both ends for BiRel, at the start only for Rel_Back', async () => {
    const { svg, layout } = await renderC4ForTest(CONTEXT);
    expect(svg).not.toContain('<marker');
    const heads = (from: string) =>
      byClass(group(svg, `class="c4-relation" data-id="${from}`), 'path', 'marker');
    expect(heads('customer')).toHaveLength(1);
    expect(heads('sys')).toHaveLength(2);
    expect(heads('other')).toHaveLength(1);
    // Rel_Back's head is at its start: its tip on the start's outline.
    const back = layout.relations.find((r) => r.from === 'other')!;
    const tip = /^M([-\d.]+),([-\d.]+)/.exec(heads('other')[0]!.d!)!;
    expect([Number(tip[1]), Number(tip[2])]).toEqual([
      +back.start.x.toFixed(2),
      +back.start.y.toFixed(2),
    ]);
    // v12's markers took the page's text colour (the root's fill), whatever the line's.
    for (const h of byClass(svg, 'path', 'marker')) expect(h.fill).toBe('var(--_tx)');
  });

  it('writes the label, the italic [techn] and the descr as the relation’s <title>', async () => {
    const src = `C4Context\nPerson(a, "A")\nSystem(b, "B")\nRel(a, b, "Uses", "HTTPS", "Reads the accounts")`;
    const { svg } = await renderC4ForTest(src);
    const rel = group(svg, 'class="c4-relation"');
    expect(rel).toMatch(
      /^<g class="c4-relation" data-id="a-&gt;b"><title>Reads the accounts<\/title><path class="c4-rel c4-rel-rel"/
    );
    expect(byClass(rel, 'text', 'c4-rel-label')).toHaveLength(1);
    expect(rel).toContain('font-style="italic">[HTTPS]<');
    // Text sits on a box of the page's background, which the line does not run through.
    expect(byClass(rel, 'rect', 'c4-rel-label-box')[0]).toMatchObject({ fill: 'var(--_bg)' });
  });

  it('numbers C4Dynamic’s relations in model order', async () => {
    const src = `C4Dynamic\nPerson(a, "A")\nSystem(b, "B")\nRel(a, b, "first")\nRelIndex(9, b, a, "second")`;
    const { svg } = await renderC4ForTest(src);
    expect(svg).toContain('>1: first<');
    expect(svg).toContain('>2: second<');
  });

  it('draws and numbers every C4Dynamic step, also steps between the same pair (#680)', async () => {
    const src = `C4Dynamic\nPerson(a, "A")\nSystem(b, "B")\nRel(a, b, "one")\nRel(b, a, "two")\nRel(a, b, "three")\nRel(a, b, "four")\nRel(b, a, "five")`;
    const { svg } = await renderC4ForTest(src);
    for (const label of ['1: one', '2: two', '3: three', '4: four', '5: five'])
      expect(svg).toContain(`>${label}<`);
    // Their lines are side by side, not on top of each other.
    const ds = byClass(svg, 'path', 'c4-rel').map((p) => p.d);
    expect(ds).toHaveLength(5);
    expect(new Set(ds).size).toBe(5);
  });

  it('takes UpdateRelStyle’s colours for the line and its text, not its heads', async () => {
    const src = `C4Context\nPerson(a, "A")\nSystem(b, "B")\nRel(a, b, "Uses", "HTTPS")\nUpdateRelStyle(a, b, $textColor="blue", $lineColor="red")`;
    const { svg } = await renderC4ForTest(src);
    expect(byClass(svg, 'path', 'c4-rel')[0]!.stroke).toBe('red');
    expect(byClass(svg, 'path', 'marker')[0]!.fill).toBe('var(--_tx)');
    expect(byClass(svg, 'text', 'c4-rel-label')[0]!.fill).toBe('blue');
    expect(byClass(svg, 'text', 'c4-rel-techn')[0]!.fill).toBe('blue');
  });
});

describe('the theme table (D456)', () => {
  const SRC = `C4Context\ntitle T\nBoundary(b, "B") {\nPerson(a, "A")\n}\nSystem(s, "S")\nRel(a, s, "uses")`;
  const roots = async (config: Record<string, unknown>) => {
    const { svg } = await renderC4ForTest(SRC, { config });
    return elements(svg, 'svg')[0]!.style!;
  };

  it('draws v12’s #444444 relations and boundaries and the page’s textColor title in light themes', async () => {
    for (const theme of ['default', 'forest', 'neutral', 'base', 'redux', 'neo']) {
      const style = await roots({ theme });
      expect(style, theme).toContain('--_c4r:var(--mermaid-c4RelationColor,#444444)');
      expect(style, theme).toContain('--_c4b:var(--mermaid-c4BoundaryColor,#444444)');
      expect(style, theme).toContain('--_c4t:var(--mermaid-c4TitleColor,var(--_tx))');
    }
  });

  it('draws lineColor relations and nodeBorder boundaries under the dark trait and darkMode', async () => {
    for (const config of [
      { theme: 'dark' },
      { theme: 'neo-dark' },
      { theme: 'redux-dark' },
      { theme: 'base', themeVariables: { darkMode: true } },
    ]) {
      const style = await roots(config);
      expect(style, JSON.stringify(config)).toContain(
        '--_c4r:var(--mermaid-c4RelationColor,var(--_l))'
      );
      expect(style, JSON.stringify(config)).toContain(
        '--_c4b:var(--mermaid-c4BoundaryColor,var(--_nb))'
      );
    }
  });

  it('lets themeVariables set the three colours', async () => {
    const { svg } = await renderC4ForTest(SRC, {
      config: {
        themeVariables: {
          c4RelationColor: '#ff0000',
          c4BoundaryColor: '#00ff00',
          c4TitleColor: '#0000ff',
        },
      },
    });
    const style = elements(svg, 'svg')[0]!.style!;
    expect(style).toContain('#ff0000');
    expect(style).toContain('#00ff00');
    expect(style).toContain('#0000ff');
  });

  it('declares only what it draws: no relation, boundary or title colour where there is none', async () => {
    const { svg } = await renderC4ForTest('C4Context\nPerson(a, "A")');
    expect(svg).not.toMatch(/--_c4[rbt]:/);
  });

  it('draws no gradient or shadow in any family (D227)', async () => {
    for (const theme of ['default', 'redux', 'redux-dark-color', 'neo', 'neo-dark']) {
      const { svg } = await renderC4ForTest(SRC, { config: { theme } });
      expect(svg, theme).not.toMatch(/filter=|url\(#|<linearGradient/);
    }
  });
});

describe('fonts (pitfall 16)', () => {
  it('draws each text in the font it was measured in: config families and sizes by kind', async () => {
    const src = `C4Context\nPerson(a, "A")\nSystem(s, "S")\nRel(a, s, "uses")`;
    const { svg, layout } = await renderC4ForTest(src, {
      config: { c4: { personFontFamily: 'Georgia', personFontSize: 20, messageFontSize: 9 } },
    });
    const name = byClass(group(svg, 'data-id="a" data-ast'), 'text', 'c4-name')[0]!;
    expect(name).toMatchObject({ 'font-family': 'Georgia', 'font-size': '20' });
    expect(layout.elements[0]!.name!.font).toMatchObject({ family: 'Georgia', size: 20 });
    // The theme's family is the root's: a text measured in it names none.
    const system = byClass(group(svg, 'data-id="s" data-ast'), 'text', 'c4-name')[0]!;
    expect(system['font-family']).toBeUndefined();
    expect(byClass(svg, 'text', 'c4-rel-label')[0]!['font-size']).toBe('9');
  });
});

describe('the plugin', () => {
  it('detects the five headers, anchored and word-bounded (D451)', () => {
    for (const h of ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'])
      expect(c4.detector(`  ${h}\nPerson(a, "A")`), h).toBe(true);
    for (const t of [
      'flowchart LR\n A[C4Container] --> B',
      'C4Contextual',
      'sequenceDiagram\nA->>C4Dynamic: hi',
    ])
      expect(c4.detector(t), t).toBe(false);
  });

  it('lists every text the layout measures (D176)', () => {
    const { model } = c4.parse(
      `C4Dynamic\ntitle T\nBoundary(b, "B", "kind", $descr="bd") {\nContainer(a, "A", "Java", "ad")\n}\nRel(a, b, "uses", "HTTP")`,
      { config: {} as never, preprocessed: undefined as never }
    );
    expect(c4.labels(model)).toEqual([
      'A',
      '[Container: Java]',
      'ad',
      'B',
      '[kind]',
      'bd',
      '1: uses',
      '[HTTP]',
      'T',
    ]);
  });
});
