import { describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { gantt } from '@mermaid-js/diagram-gantt';
import { createMermaid } from 'mermaid';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

/**
 * The gantt renderer's behaviour (spec #293 T4) through `createMermaid().render()` at a fixed
 * `now`: v12's classes, the milestone diamond, links (R-SVG-4, R-SEC-4), the today marker
 * (R-SEC-2) and the theme variables it paints with (D152, D278). The plugin is registered in
 * place of the first-party entry until the integration (#385).
 */
const NOW = new Date(2014, 0, 3, 12).getTime();
const HEAD = 'gantt\ndateFormat YYYY-MM-DD\n';

async function render(
  source: string,
  config: Record<string, unknown> = {}
): Promise<{ svg: string; tree: SvgView; warnings: readonly Warning[] }> {
  const m = createMermaid();
  await m.registerExternalDiagrams([gantt], { replace: true });
  m.initialize({ deterministic: true, theme: 'default', ...config });
  const r = await m.render('g', HEAD + source, { now: NOW });
  return { svg: r.svg, tree: parseSvg(r.svg), warnings: r.warnings };
}

const byClass = (tree: SvgView, tag: string, cls: string): SvgElement[] =>
  tree.find((n, t) => t.tag(n) === tag && (t.getAttr(n, 'class') ?? '').split(' ').includes(cls));
const attr = (tree: SvgView, el: SvgElement | undefined, name: string): string | undefined =>
  el === undefined ? undefined : tree.getAttr(el, name);

describe('gantt bars and labels keep v12 classes', () => {
  it('writes the state, slot and side classes v12 wrote', async () => {
    const { tree } = await render(
      [
        'section A',
        'Plain :a, 2014-01-01, 2d',
        'Active :active, b, after a, 2d',
        'Done :done, c, after b, 2d',
        'Crit :crit, d, after c, 2d',
        'Active crit :active, crit, e, after d, 2d',
        'Done crit :done, crit, f, after e, 2d',
        'section B',
        'Other :g, 2014-01-02, 1d',
        'A long label that does not fit in one day :h, 2014-01-05, 1d',
      ].join('\n')
    );
    const classOf = (id: string, tag: string) =>
      attr(
        tree,
        tree.find((n, t) => t.tag(n) === tag && t.getAttr(n, 'data-id') === id)[0],
        'class'
      );
    expect(classOf('a', 'rect')).toBe('task task0');
    expect(classOf('b', 'rect')).toBe('task active0');
    expect(classOf('c', 'rect')).toBe('task done0');
    expect(classOf('d', 'rect')).toBe('task crit0');
    expect(classOf('e', 'rect')).toBe('task activeCrit0');
    expect(classOf('f', 'rect')).toBe('task doneCrit0');
    expect(classOf('g', 'rect')).toBe('task task1');
    expect(classOf('a', 'text')).toBe('taskText taskText0');
    // v12 adds `critText` to an active crit task that is not done.
    expect(classOf('e', 'text')).toBe('taskText taskText0 activeCritText0 critText0');
    expect(classOf('f', 'text')).toBe('taskText taskText0 doneCritText0');
    expect(classOf('d', 'text')).toBe('taskText taskText0 critText0');
    expect(classOf('h', 'text')).toMatch(/^taskTextOutside(Right|Left) taskTextOutside1$/);
    // Bands and section titles by slot; the label carries data-id only.
    expect(byClass(tree, 'rect', 'section').map((r) => attr(tree, r, 'class'))).toContain(
      'section section1'
    );
    expect(byClass(tree, 'text', 'sectionTitle').map((t) => attr(tree, t, 'class'))).toEqual([
      'sectionTitle sectionTitle0',
      'sectionTitle sectionTitle1',
    ]);
    for (const t of byClass(tree, 'text', 'taskText'))
      expect(attr(tree, t, 'data-ast')).toBe(undefined);
  });

  it('draws an outside label with v12 text-anchor start (right) or end (left)', async () => {
    const { tree } = await render(
      'Span :s, 2014-01-01, 60d\nEarly with a long label :a, 2014-01-01, 1d\nLate with a long label :b, 2014-03-01, 1d'
    );
    expect(attr(tree, byClass(tree, 'text', 'taskTextOutsideRight')[0], 'text-anchor')).toBe(
      'start'
    );
    expect(attr(tree, byClass(tree, 'text', 'taskTextOutsideLeft')[0], 'text-anchor')).toBe('end');
  });

  it('draws a milestone as its square rotated 45° and scaled 0.8 about its centre', async () => {
    const { tree } = await render('M :milestone, m, 2014-01-02, 0d\nT :t, 2014-01-01, 4d');
    const [m] = byClass(tree, 'rect', 'milestone');
    expect(attr(tree, m, 'class')).toBe('task milestone task0');
    const x = Number(attr(tree, m, 'x'));
    const y = Number(attr(tree, m, 'y'));
    const w = Number(attr(tree, m, 'width'));
    const cx = x + w / 2;
    const cy = y + w / 2;
    const n = (v: number) => String(Math.round(v * 100) / 100);
    expect(attr(tree, m, 'transform')).toBe(
      `rotate(45,${n(cx)},${n(cy)}) translate(${n(cx)},${n(cy)}) scale(0.8,0.8) translate(${n(-cx)},${n(-cy)})`
    );
    expect(attr(tree, byClass(tree, 'text', 'milestoneText')[0], 'font-style')).toBe('italic');
  });

  it('draws a vert marker with the vert classes and its label at 15px', async () => {
    const { tree } = await render('T :t, 2014-01-01, 4d\nDeadline :vert, v, 2014-01-03, 0d');
    expect(attr(tree, byClass(tree, 'rect', 'vert')[0], 'class')).toBe('task vert task0');
    const label = byClass(tree, 'text', 'vertText')[0];
    expect(attr(tree, label, 'font-size')).toBe('15');
    expect(attr(tree, label, 'fill')).toBe('var(--_gvl)');
  });

  it('keeps both vert and milestone on one task, as v12 did', async () => {
    const { tree } = await render('T :t, 2014-01-01, 4d\nW :milestone, vert, w, 2014-01-03, 0d');
    const [bar] = byClass(tree, 'rect', 'vert');
    expect(attr(tree, bar, 'class')).toBe('task vert milestone task0');
    // The milestone's square, barHeight wide, rotated and scaled about v12's transform-origin.
    expect(attr(tree, bar, 'width')).toBe('20');
    expect(attr(tree, bar, 'transform')).toMatch(
      /^rotate\(45,[\d.]+,[\d.]+\) .*scale\(0\.8,0\.8\)/
    );
    const label = byClass(tree, 'text', 'vertText')[0];
    expect(attr(tree, label, 'class')).toMatch(/ milestoneText vertText$/);
    expect(attr(tree, label, 'font-style')).toBe('italic');
  });
});

describe('gantt links (R-SVG-4, R-SEC-4)', () => {
  it('puts a linked task bar and label in one <a href>, URL as written, no target', async () => {
    const { tree, svg } = await render(
      'a :a1, 2014-01-01, 1d\nb :b1, 2014-01-02, 1d\nclick a1 href "https://example.com/x?y=1&z=2"'
    );
    const links = tree.find({ tag: 'a' });
    expect(links).toHaveLength(1);
    const a = links[0]!;
    expect(attr(tree, a, 'href')).toBe('https://example.com/x?y=1&z=2');
    expect(attr(tree, a, 'target')).toBeUndefined();
    const kids = tree.children(a).map((k) => [tree.tag(k), attr(tree, k, 'data-id')]);
    expect(kids).toEqual([
      ['rect', 'a1'],
      ['text', 'a1'],
    ]);
    expect(attr(tree, tree.children(a)[0], 'class')).toBe('task task0 clickable');
    expect(attr(tree, tree.children(a)[1], 'font-weight')).toBe('bold');
    expect(svg.match(/<a /g)).toHaveLength(1);
  });

  it('draws a task with an unsafe URL unlinked, with one URL_REFUSED warning', async () => {
    const { tree, warnings } = await render(
      'a :a1, 2014-01-01, 1d\nb :b1, 2014-01-02, 1d\nclick a1,b1 href "javascript:alert(1)"'
    );
    expect(tree.find({ tag: 'a' })).toEqual([]);
    expect(warnings.filter((w) => w.code === 'URL_REFUSED')).toHaveLength(1);
    expect(byClass(tree, 'rect', 'clickable')).toHaveLength(2);
  });

  it('links nothing under securityLevel strict but a relative URL', async () => {
    const strict = { securityLevel: 'strict' };
    const abs = await render('a :a1, 2014-01-01, 1d\nclick a1 href "https://example.com"', strict);
    expect(abs.tree.find({ tag: 'a' })).toEqual([]);
    const rel = await render('a :a1, 2014-01-01, 1d\nclick a1 href "#here"', strict);
    expect(attr(rel.tree, rel.tree.find({ tag: 'a' })[0], 'href')).toBe('#here');
  });

  it('links only a task that exists when the click is read, as v12 setLink', async () => {
    const { tree, warnings } = await render(
      'click a1 href "https://example.com"\nA :a1, 2014-01-01, 1d\nclick a1 call f()'
    );
    expect(tree.find({ tag: 'a' })).toEqual([]);
    expect(byClass(tree, 'rect', 'clickable')).toHaveLength(1);
    expect(warnings.map((w) => w.code)).not.toContain('URL_REFUSED');
  });

  it('checks no URL of a click naming no task', async () => {
    const { warnings } = await render(
      'A :a1, 2014-01-01, 1d\nclick nobody href "javascript:alert(1)"'
    );
    expect(warnings.map((w) => w.code)).not.toContain('URL_REFUSED');
  });

  it('marks a call target clickable without a link', async () => {
    const { tree } = await render('a :a1, 2014-01-01, 1d\nclick a1 call cb()');
    expect(tree.find({ tag: 'a' })).toEqual([]);
    expect(attr(tree, byClass(tree, 'text', 'clickable')[0], 'class')).toBe(
      'clickable taskText taskText0'
    );
  });
});

describe('gantt today line (R-SEC-2)', () => {
  const T = 'a :a1, 2014-01-01, 5d\n';
  const line = (tree: SvgView) => byClass(tree, 'line', 'today')[0];

  it('draws the today line at now in todayLineColor, 2px', async () => {
    const { tree } = await render(T);
    expect(attr(tree, line(tree), 'stroke')).toBe('var(--_gtl)');
    expect(attr(tree, line(tree), 'stroke-width')).toBe('2');
  });

  it('applies todayMarker styles split on "," as v12 did', async () => {
    const { tree } = await render(T + 'todayMarker stroke-width:5px,stroke:#0000FF,opacity:0.5');
    const l = line(tree);
    expect([
      attr(tree, l, 'stroke-width'),
      attr(tree, l, 'stroke'),
      attr(tree, l, 'opacity'),
    ]).toEqual(['5px', '#0000FF', '0.5']);
  });

  it('drops an unsafe or unknown style with a warning', async () => {
    const { tree, warnings, svg } = await render(
      T + 'todayMarker stroke:url(javascript:alert(1)),onload:alert(1)'
    );
    expect(attr(tree, line(tree), 'stroke')).toBe('var(--_gtl)');
    expect(svg).not.toMatch(/javascript|onload/);
    expect(warnings.some((w) => w.code === 'STYLE_PROPERTY_DROPPED')).toBe(true);
  });

  it('draws none with todayMarker off', async () => {
    const { tree } = await render(T + 'todayMarker off');
    expect(byClass(tree, 'g', 'today')).toEqual([]);
  });
});

describe('gantt theme variables (D152, D278)', () => {
  it('paints with the v12 gantt variables, which themeVariables override', async () => {
    const { svg } = await render('section S\na :done, a1, 2014-01-01, 1d\nb :b1, after a1, 1d', {
      themeVariables: { taskBkgColor: '#123456', doneTaskBkgColor: '#654321' },
    });
    expect(svg).toContain('--_gtb:var(--mermaid-taskBkgColor,#123456)');
    expect(svg).toContain('--_gdb:var(--mermaid-doneTaskBkgColor,#654321)');
    expect(svg).toContain('--_gb0:var(--mermaid-sectionBkgColor,');
  });

  it('writes literal colours with cssVariables off', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([gantt], { replace: true });
    m.initialize({
      deterministic: true,
      output: { cssVariables: false },
      themeVariables: { critBkgColor: '#ff0000' },
    });
    const { svg } = await m.render('g', HEAD + 'a :crit, a1, 2014-01-01, 1d', { now: NOW });
    expect(svg).toMatch(/class="task crit0"[^>]* fill="#ff0000"/);
    expect(svg).not.toContain('var(');
  });

  it('draws neo with no gradient and no shadow', async () => {
    for (const theme of ['neo', 'neo-dark', 'redux-color']) {
      const { svg } = await render('a :a1, 2014-01-01, 1d', { theme });
      expect(svg, theme).not.toMatch(/linearGradient|filter=|url\(/);
    }
  });

  it('paints a slot past v12 styles (numberSectionStyles > 4) as v12: root text colour, no stroke', async () => {
    const sections = Array.from(
      { length: 6 },
      (_, i) => `section S${i}\nt${i} :t${i}, 2014-01-0${i + 1}, 1d`
    );
    const { tree } = await render(sections.join('\n'), { gantt: { numberSectionStyles: 6 } });
    const bar = tree.find((n, t) => t.tag(n) === 'rect' && t.getAttr(n, 'data-id') === 't5')[0];
    expect(attr(tree, bar, 'class')).toBe('task task5');
    expect(attr(tree, bar, 'fill')).toBe('var(--_tx)');
    expect(attr(tree, bar, 'stroke')).toBeUndefined();
  });
});

describe('gantt sections (R-PARSE-8)', () => {
  const dataAst = (tree: SvgView): string[] =>
    tree
      .find((n, t) => t.getAttr(n, 'data-ast')?.startsWith('s:') === true)
      .map((n) => tree.getAttr(n, 'data-ast')!);

  it('gives a repeated section and a vert-only section one data-ast element each', async () => {
    const { tree } = await render(
      'section A\na :a1, 2014-01-01, 1d\nsection B\nV :vert, v1, 2014-01-02, 0d\nsection A\nb :b1, 2014-01-02, 1d'
    );
    expect(dataAst(tree).sort()).toEqual(['s:A', 's:A@2', 's:B']);
    // One drawn title per name, as v12.
    expect(byClass(tree, 'text', 'sectionTitle')).toHaveLength(1);
  });

  it('writes no empty group when the only section is unnamed', async () => {
    const { svg } = await render('a :a1, 2014-01-01, 1d');
    expect(svg).not.toMatch(/<g\/>|<g><\/g>/);
  });
});
