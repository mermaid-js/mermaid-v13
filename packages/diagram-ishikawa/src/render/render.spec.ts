// The ishikawa renderer (spec #519 T4) through the plugin's own seam: `.mmd` fixtures parsed, laid
// out and drawn with core's render context (`renderIshikawaForTest`). v12's structure and
// classes, the arrowheads as paths, the shared colours and fonts (D493), the AST marks (D497),
// the accessible name (D492), the `w.outline` hook (D494) and the root. The corpus properties
// are `conformance/src/ishikawa/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineDraw, OutlineRole, OutlineTag } from '@mermaid-js/core/svg';
import { fixture, fixtureSource } from '../layout/mmd.fixtures.ts';
import { ishikawa } from '../plugin.ts';
import { renderIshikawaForTest, type RenderIshikawaOptions } from './harness.ts';

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

/** The start tags and end tags of `svg` with their classes only, as an outline of its structure. */
function skeleton(svg: string): string[] {
  return [...svg.matchAll(/<(\/?)([\w]+)\b([^>]*?)(\/?)>/g)]
    .filter((m) => !['tspan'].includes(m[2]!))
    .map((m) => {
      if (m[1]) return `/${m[2]}`;
      const cls = /\sclass="([^"]*)"/.exec(m[3]!)?.[1];
      return `${m[2]}${cls ? `.${cls.replaceAll(' ', '.')}` : ''}${m[4] ? '/' : ''}`;
    })
    .filter((t) => t !== '/text');
}

/** Each `<text>` with its class, data-id and character data. */
function texts(svg: string): { cls: string; id?: string; text: string }[] {
  return [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)].map((m) => {
    const attr = (k: string) => new RegExp(`\\s${k}="([^"]*)"`).exec(m[1]!)?.[1];
    return { cls: attr('class') ?? '', id: attr('data-id'), text: m[2]!.replace(/<[^>]+>/g, '') };
  });
}

const render = (path: string, options?: RenderIshikawaOptions) =>
  renderIshikawaForTest(fixtureSource(path), options);
const SIMPLE = 'pr-check/1-should-render-a-simple-ishikawa-diagram';

describe('structure (spec #519 Renderer)', () => {
  it('draws v12’s groups and classes: spine, head group, then a pair group per two causes', async () => {
    const { svg } = await render(SIMPLE);
    expect(svg).toMatch(
      /^<svg [^>]*class="mermaid mermaid-ishikawa"[^>]*aria-roledescription="ishikawa"/
    );
    expect(skeleton(svg).slice(3)).toEqual([
      'g.ishikawa',
      'line.ishikawa-spine/',
      'g.ishikawa-head-group',
      'path.ishikawa-head/',
      'text.ishikawa-head-label',
      '/g',
      'g.ishikawa-pair',
      // Process (upper)
      'line.ishikawa-branch/',
      'path.ishikawa-arrow/',
      'g.ishikawa-label-group',
      'rect.ishikawa-label-box/',
      'text.ishikawa-label.cause',
      '/g',
      'g.ishikawa-sub-group',
      'line.ishikawa-sub-branch/',
      'path.ishikawa-arrow/',
      'text.ishikawa-label.align',
      '/g',
      // User (lower)
      'line.ishikawa-branch/',
      'path.ishikawa-arrow/',
      'g.ishikawa-label-group',
      'rect.ishikawa-label-box/',
      'text.ishikawa-label.cause',
      '/g',
      'g.ishikawa-sub-group',
      'line.ishikawa-sub-branch/',
      'path.ishikawa-arrow/',
      'text.ishikawa-label.align',
      '/g',
      '/g',
      '/g',
      '/svg',
    ]);
    expect(texts(svg).map((t) => t.text)).toEqual([
      'Blurry Photo',
      'Process',
      'Out of focus',
      'User',
      'Shaky hands',
    ]);
  });
});

describe('arrowheads (spec #519 Renderer)', () => {
  it('puts a filled triangle at the start of every branch and sub-branch: 12 px on causes, 6 px below', async () => {
    const { svg, layout } = await render('pr-check/3-should-render-with-deeply-nested-causes');
    const bones = layout.pairs.flatMap((p) =>
      p.causes.flatMap((c) => [c.bone, ...c.subCauses.map((s) => s.bone)])
    );
    const arrows = elements(svg, 'path').filter((e) => e.class === 'ishikawa-arrow');
    expect(arrows).toHaveLength(bones.length);
    expect(svg).not.toMatch(/<marker|<defs|marker-start/);
    arrows.forEach((a, i) => {
      const bone = bones[i]!;
      const pts = [...a.d!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
      }));
      expect(pts[0]!.x).toBeCloseTo(bone.x1, 2);
      expect(pts[0]!.y).toBeCloseTo(bone.y1, 2);
      // v12's marker (6 on a 0 0 10 10 box, no markerUnits) is 6 px per unit of stroke.
      const size = bone.depth === 1 ? 12 : 6;
      expect(Math.hypot(pts[1]!.x - pts[2]!.x, pts[1]!.y - pts[2]!.y)).toBeCloseTo(size, 1);
      const mid = { x: (pts[1]!.x + pts[2]!.x) / 2, y: (pts[1]!.y + pts[2]!.y) / 2 };
      expect(Math.hypot(mid.x - bone.x1, mid.y - bone.y1)).toBeCloseTo(size, 1);
      expect(a.fill).toBe(elements(svg, 'line')[0]!.stroke);
    });
  });
});

describe('colours and fonts (D493, D152, D227)', () => {
  it('strokes with lineColor, fills with mainBkg, inks with textColor; the head label 600 at 14 px', async () => {
    const { svg } = await render(SIMPLE, {
      config: { theme: 'default', themeVariables: { fontSize: '18px' } },
    });
    const vars = /style="([^"]*)"/.exec(svg)![1]!;
    expect(vars).toMatch(/--_l:var\(--mermaid-lineColor,#333333\)/);
    expect(vars).toMatch(/--_mb:var\(--mermaid-mainBkg,/);
    expect(vars).toMatch(/--_tx:var\(--mermaid-textColor,#333333\)/);
    for (const l of elements(svg, 'line')) expect(l.stroke).toBe('var(--_l)');
    for (const cls of ['ishikawa-head', 'ishikawa-label-box']) {
      const shape = elements(svg, 'path|rect').find((e) => e.class === cls);
      expect(shape, cls).toMatchObject({
        fill: 'var(--_mb)',
        stroke: 'var(--_l)',
        'stroke-width': '2',
      });
    }
    expect(elements(svg, 'line').map((l) => `${l.class} ${l['stroke-width']}`)).toEqual([
      'ishikawa-spine 2',
      'ishikawa-branch 2',
      'ishikawa-sub-branch 1',
      'ishikawa-branch 2',
      'ishikawa-sub-branch 1',
    ]);
    const text = elements(svg, 'text');
    for (const t of text) expect(t.fill).toBe('var(--_tx)');
    expect(text[0]).toMatchObject({
      class: 'ishikawa-head-label',
      'font-size': '14',
      'font-weight': '600',
    });
    for (const t of text.slice(1)) {
      expect(t['font-size']).toBe('18');
      expect(t['font-weight']).toBeUndefined();
    }
    expect(svg).toMatch(/^<svg [^>]*font-family="var\(--_ff\)"/);
  });

  it('draws the dark and neo themes from the same variables: no theme-name branch (D227)', async () => {
    const shapes = (svg: string) => elements(svg, 'line|path|rect|text').map((e) => e.class);
    const plain = await render(SIMPLE);
    for (const path of ['pr-check/8-should-render-with-dark-theme', 'nightly-check/theme-neo']) {
      const { svg } = await render(path);
      expect(shapes(svg), path).toEqual(shapes(plain.svg));
      expect(svg, path).not.toMatch(/filter|url\(#/);
    }
  });
});

describe('AST marks (D497, pitfall 12)', () => {
  it('puts data-ast on the head group, each label group and each sub-group, data-id on bones and text', async () => {
    const { svg, model } = await render('pr-check/3-should-render-with-deeply-nested-causes');
    const marked = [...svg.matchAll(/<(\w+) class="([^"]*)"[^>]*data-ast="([^"]*)"/g)].map(
      (m) => `${m[1]}.${m[2]} ${m[3]}`
    );
    expect(marked).toEqual([
      'g.ishikawa-head-group effect',
      'g.ishikawa-label-group cause:1',
      'g.ishikawa-sub-group cause:1.2',
      'g.ishikawa-sub-group cause:1.2.1',
      'g.ishikawa-sub-group cause:1.1',
      'g.ishikawa-sub-group cause:1.1.2',
      'g.ishikawa-sub-group cause:1.1.1',
      'g.ishikawa-label-group cause:2',
      'g.ishikawa-sub-group cause:2.1',
      'g.ishikawa-sub-group cause:2.1.1',
    ]);
    expect(model.causes.map((c) => c.text)).toEqual(['Hardware', 'Software']);
    for (const e of elements(svg, 'line|text|path')) {
      expect(e['data-ast'], e.class).toBeUndefined();
      if (e.class === 'ishikawa-head') expect(e['data-id']).toBeUndefined();
      else expect(e['data-id'], e.class).toMatch(/^(effect|cause:[\d.]+)$/);
    }
    // The marked groups carry data-ast only.
    for (const g of elements(svg, 'g')) if (g['data-ast']) expect(g['data-id']).toBeUndefined();
    expect(texts(svg).find((t) => t.text === 'Race condition')?.id).toBe('cause:2.1.1');
  });
});

describe('labels', () => {
  it('right-aligns sub-cause lines at v12’s end anchor, and up or down on the diagonals', async () => {
    const { svg, layout } = await render('nightly-check/line-breaks-in-labels');
    const subs = layout.pairs.flatMap((p) => p.causes.flatMap((c) => c.subCauses));
    const multi = subs.find((s) => s.label.text.lines.length > 1)!;
    expect(multi).toBeDefined();
    const group = svg
      .split('<g class="ishikawa-sub-group"')
      .find((g) => g.includes(`data-id="${multi.ast}"`))!;
    const right = [...group.matchAll(/<tspan x="(-?[\d.]+)"/g)].map(
      (m, i) => Number(m[1]) + multi.label.text.widths[i]!
    );
    for (const r of right) expect(r).toBeCloseTo(multi.label.anchor.x, 1);
    const deep = await render('pr-check/3-should-render-with-deeply-nested-causes');
    const kinds = texts(deep.svg).map((t) => t.cls);
    expect(kinds).toContain('ishikawa-label up');
    expect(kinds).toContain('ishikawa-label down');
    expect(kinds).toContain('ishikawa-label align');
  });
});

describe('root and accessible name (D492, D133)', () => {
  it('names the diagram by the effect, or by the front-matter title when given; draws neither', async () => {
    const simple = await render(SIMPLE);
    expect(simple.svg).toContain('<title id="mermaid-0-title">Blurry Photo</title>');
    expect(simple.svg).toMatch(/^<svg [^>]*aria-labelledby="mermaid-0-title"/);
    const titled = await render('nightly-check/front-matter-title');
    expect(titled.svg).toContain('<title id="mermaid-0-title">Front-matter title</title>');
    expect(texts(titled.svg).map((t) => t.text)).not.toContain('Front-matter title');
    expect(texts(titled.svg)[0]!.text).toBe('Effect wins');
    for (const svg of [simple.svg, titled.svg]) {
      const ids = [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
      expect(ids).toEqual(['mermaid-0-title']);
    }
  });

  it('names it by the effect as plain text: entities decoded, a <br> a space (D492)', async () => {
    const { svg, model } = await render('nightly-check/markup-in-effect');
    expect(model.effect?.text).toBe('Blurry<br>photo &amp; x');
    expect(svg).toContain('<title id="mermaid-0-title">Blurry photo &amp; x</title>');
    // Drawn as two lines, the entity decoded once.
    expect(svg).toMatch(/<tspan [^>]*>Blurry<\/tspan><tspan [^>]*>photo &amp; x<\/tspan>/);
    const breaks = await render('nightly-check/line-breaks-in-labels');
    expect(breaks.svg).toContain('<title id="mermaid-0-title">Coffee tastes bitter</title>');
  });

  it('draws an effect alone as the head and a zero-length spine, and an empty body as an empty svg', async () => {
    const alone = await render('pr-check/5-should-render-with-no-children-root-only');
    expect(skeleton(alone.svg).slice(3)).toEqual([
      'g.ishikawa',
      'line.ishikawa-spine/',
      'g.ishikawa-head-group',
      'path.ishikawa-head/',
      'text.ishikawa-head-label',
      '/g',
      '/g',
      '/svg',
    ]);
    const empty = await render('nightly-check/empty-document');
    expect(skeleton(empty.svg)).toEqual(['svg.mermaid.mermaid-ishikawa/']);
    expect(empty.svg).not.toContain('aria-labelledby');
  });

  it('sizes the root by the layout’s bounds, at 100 % width unless ishikawa.useMaxWidth is false', async () => {
    const { svg, layout } = await render(SIMPLE);
    const [root] = elements(svg, 'svg');
    const box = root!.viewBox!.split(' ').map(Number);
    const { x, y, width, height } = layout.bounds;
    expect(box[0]).toBeCloseTo(x, 2);
    expect(box[1]).toBeCloseTo(y, 2);
    expect(box.slice(2)).toEqual([Math.ceil(width), Math.ceil(height)]);
    expect(root!.width).toBe('100%');
    expect(root!.style).toMatch(new RegExp(`^max-width:${Math.ceil(width)}px;`));
    const fixed = await render('nightly-check/should-render-usemaxwidth-false');
    const b = fixed.layout.bounds;
    expect(fixed.svg).toMatch(
      new RegExp(`width="${Math.ceil(b.width)}" height="${Math.ceil(b.height)}"`)
    );
    expect(fixed.svg).not.toContain('max-width');
  });
});

describe('hand-drawn (D494, D302)', () => {
  const recording = () => {
    const calls: { role: OutlineRole; tag: OutlineTag; attrs: Attrs }[] = [];
    const draw: OutlineDraw = (role, tag, attrs) => {
      calls.push({ role, tag, attrs });
      return false;
    };
    return { calls, draw };
  };

  it.each([
    'pr-check/6-should-render-with-handdrawn-look',
    'nightly-check/hand-drawn-seed',
    'pr-check/3-should-render-with-deeply-nested-causes',
  ])(
    '%s: the head and boxes are node outlines, the spine and bones edge lines; a declining drawer changes nothing',
    async (path) => {
      const { calls, draw } = recording();
      const sketched = await render(path, { outline: draw });
      const plain = await render(path);
      expect(sketched.svg).toBe(plain.svg);
      const causes = sketched.layout.pairs.flatMap((p) => p.causes);
      const subs = causes.flatMap((c) => c.subCauses);
      expect(calls.map((c) => `${c.role} ${c.tag} ${c.attrs.class}`)).toEqual([
        'edge line ishikawa-spine',
        'node path ishikawa-head',
        ...causes.flatMap((c) => [
          'edge line ishikawa-branch',
          'node rect ishikawa-label-box',
          ...c.subCauses.map(() => 'edge line ishikawa-sub-branch'),
        ]),
      ]);
      expect(subs.length).toBeGreaterThan(0);
    }
  );

  it('writes a drawer’s replacement in place, and keeps arrowheads and text plain', async () => {
    const draw: OutlineDraw = (role, _tag, attrs, sink) => {
      sink.open('g', { class: `sketch-${role}` });
      sink.leaf('path', { d: sink.path().moveTo(0, 0).done(), stroke: attrs.stroke });
      sink.close();
      return true;
    };
    const { svg } = await render(SIMPLE, { outline: draw });
    expect(svg).not.toMatch(/<(line|rect)\b/);
    expect(svg.match(/class="sketch-edge"/g)).toHaveLength(5);
    expect(svg.match(/class="sketch-node"/g)).toHaveLength(3);
    expect(svg.match(/class="ishikawa-arrow"/g)).toHaveLength(4);
    expect(svg).toMatch(/<g class="ishikawa-head-group"[^>]*><g class="sketch-node">/);
  });
});

describe('the plugin (DESIGN §12.1)', () => {
  it('draws SVG and text, lays itself out and has no theme table (spec #519)', () => {
    expect(ishikawa).toMatchObject({
      id: 'ishikawa',
      formats: ['svg', 'ascii'],
      layoutKind: 'custom',
    });
    // The text hook is the lazily loaded `./ascii` entry (#586), not on the plugin.
    expect('ascii' in ishikawa).toBe(false);
    expect('theme' in ishikawa).toBe(false);
  });

  it('lists every text the layout measures: the effect, then each cause in source order', () => {
    const { model } = fixture('pr-check/3-should-render-with-deeply-nested-causes');
    expect(ishikawa.labels(model)).toEqual([
      'Server Outage',
      'Hardware',
      'Disk',
      'Bad sectors',
      'Full capacity',
      'Memory',
      'Leak detected',
      'Software',
      'Bug',
      'Race condition',
    ]);
  });
});
