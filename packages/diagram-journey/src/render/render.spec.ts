// cspell:words nums
/**
 * The journey renderer (spec #290 T4) over the hand-built fixtures: render properties (DESIGN
 * §13.2, §13.4) and the SVG structure MIGRATION.md describes. There is no parser yet (T2 #302),
 * so models come from `FIXTURES` through `layoutJourney`; T5 #327 runs the same properties
 * through `createMermaid().render()` on the corpus.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import {
  assertInert,
  inertProblem,
  streamWriter,
  treeWriter,
  type SvgNode,
  type SvgTree,
} from '@mermaid-js/core/svg';
import { PAYLOADS } from '@mermaid-js/core/svg/testing';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { FIXTURES, journey, section, task } from '../layout/fixtures.ts';
import { layoutJourney, type JourneyLayout } from '../layout/index.ts';
import type { JourneyModel } from '../model.ts';
import { renderJourney } from './render.ts';

const THEMES = ['default', 'dark', 'neutral', 'redux', 'redux-color', 'redux-dark-color'] as const;
type ThemeName = (typeof THEMES)[number];
const specs = new Map<ThemeName, ThemeSpec>();
beforeAll(async () => {
  for (const name of THEMES) specs.set(name, await loadTheme(name));
});

interface Options {
  readonly config?: Readonly<Record<string, unknown>>;
  readonly theme?: ThemeName;
  readonly themeVariables?: Readonly<Record<string, unknown>>;
  /** `theme: 'auto'`: `dark` under `prefers-color-scheme: dark`. */
  readonly auto?: boolean;
  readonly cssVariables?: boolean;
  readonly stream?: boolean;
}

interface Rendered {
  readonly svg: string;
  readonly tree: SvgTree;
  readonly layout: JourneyLayout;
  readonly warnings: readonly Warning[];
}

function render(model: JourneyModel, o: Options = {}): Rendered {
  const warnings: Warning[] = [];
  const theme = createTheme(specs.get(o.theme ?? 'default')!, {
    themeVariables: o.themeVariables,
    cssVariables: o.cssVariables,
    dark: o.auto ? specs.get('dark') : undefined,
  });
  const ctx = {
    config: { journey: o.config ?? {} } as unknown as ResolvedConfig,
    theme,
    measurer: tableMeasurer,
    warn: (w: Warning) => void warnings.push(w),
    idPrefix: 'mermaid-0',
    version: '13.0.0-alpha.0',
  };
  const layout = layoutJourney(model, ctx);
  if (o.stream) {
    const w = streamWriter();
    renderJourney(model, layout, ctx, w);
    return { svg: w.finish(), tree: treeWriter().tree, layout, warnings };
  }
  const w = treeWriter();
  renderJourney(model, layout, ctx, w);
  return { svg: w.finish(), tree: w.tree, layout, warnings };
}

/**
 * The first XML error in `svg`, if any. Diagram packages import only core (the
 * `import-boundaries` rule), so this is core's inert scan, which tokenises the markup strictly
 * (balanced tags, quoted unique attributes, escaped text, XML characters), plus one root
 * element. T5's conformance spec runs a full XML parser over the corpus.
 */
function wellFormed(svg: string, themeStyle = false): string | undefined {
  const problem = inertProblem(svg, { themeStyle });
  if (problem !== undefined) return problem;
  if (!svg.startsWith('<svg ') || !svg.endsWith('</svg>')) return 'not one <svg> root';
  return svg.indexOf('</svg>') === svg.length - '</svg>'.length ? undefined : 'two roots';
}

/** Every coordinate an element draws at (no transforms are written). */
function extents(tree: SvgTree): { x: number; y: number; tag: string }[] {
  const out: { x: number; y: number; tag: string }[] = [];
  const nums = (s: string): number[] =>
    (s.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map(Number);
  const walk = (node: SvgNode): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: Parameters<SvgTree['getAttr']>[1]): number =>
      Number(tree.getAttr(node, name) ?? 0);
    const put = (x: number, y: number): void => void out.push({ x, y, tag: tag ?? '' });
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle') {
      put(at('cx') - at('r'), at('cy') - at('r'));
      put(at('cx') + at('r'), at('cy') + at('r'));
    } else if (tag === 'line') {
      put(at('x1'), at('y1'));
      put(at('x2'), at('y2'));
    } else if (tag === 'path') {
      // Absolute commands only; an arc's radius never reaches past its face.
      for (const seg of (tree.getAttr(node, 'd') ?? '').match(/[MLAZ][^MLAZ]*/g) ?? []) {
        const p = nums(seg.slice(1));
        if (seg.startsWith('A')) put(p[5]!, p[6]!);
        else for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
      }
    } else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
      put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c);
  };
  walk(tree.root);
  return out;
}

const root = (tree: SvgTree): SvgNode => tree.find({ tag: 'svg' })[0]!;
const byAst = (tree: SvgTree, id: string): SvgNode[] =>
  tree.find((n, t) => t.getAttr(n, 'data-ast') === id);
const classOf = (tree: SvgTree, n: SvgNode): string | undefined => tree.getAttr(n, 'class');
const byClass = (tree: SvgTree, cls: string): SvgNode[] =>
  tree.find((n, t) => (t.getAttr(n, 'class') ?? '').split(' ').includes(cls));
const textIn = (tree: SvgTree, node: SvgNode): string =>
  tree
    .children(node)
    .map((c) => tree.textOf(c) ?? textIn(tree, c))
    .join('');

// The writer rounds coordinates to two decimals.
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly model: JourneyModel;
  readonly options: Options;
  readonly result: Rendered;
}

const VARIANTS: readonly { readonly name: string; readonly options: Omit<Options, 'config'> }[] = [
  ...THEMES.map((theme) => ({ name: theme, options: { theme } })),
  { name: 'auto', options: { auto: true } },
  { name: 'literal colours', options: { cssVariables: false } },
];

let cases: Case[] = [];
beforeAll(() => {
  cases = Object.entries(FIXTURES).flatMap(([name, f]) =>
    VARIANTS.map((v) => {
      const options = { ...v.options, config: f.config };
      return {
        id: `${name}, ${v.name}`,
        model: f.model,
        options,
        result: render(f.model, options),
      };
    })
  );
});

describe('journey render properties over the fixtures', () => {
  it('renders every fixture in every variant', () => {
    expect(cases.length).toBe(Object.keys(FIXTURES).length * VARIANTS.length);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg, c.options.auto), c.id).toBeUndefined();
      expect(() => assertInert(c.result.svg, { themeStyle: c.options.auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic, and both writer backings write the same bytes (R-ARCH-6)', () => {
    for (const c of cases) {
      expect(render(c.model, c.options).svg, c.id).toBe(c.result.svg);
      expect(render(c.model, { ...c.options, stream: true }).svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined, no foreignObject and no marker', () => {
    for (const c of cases)
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
  });

  it('writes no element ids but the title and description', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox, which is the layout bounds', () => {
    for (const c of cases) {
      const { tree, layout } = c.result;
      const [x, y, w, h] = tree.getAttr(root(tree), 'viewBox')!.split(' ').map(Number);
      expect(x, c.id).toBeCloseTo(layout.bounds.x, 2);
      expect(y, c.id).toBeCloseTo(layout.bounds.y, 2);
      expect(w, c.id).toBe(Math.max(1, Math.ceil(layout.bounds.width)));
      const out = extents(tree).filter(
        (p) => p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('maps every section line, task and actor mention to exactly one data-ast element (R-PARSE-8)', () => {
    for (const c of cases) {
      const { tree } = c.result;
      const nodes = [
        ...c.model.sections.map((n) => n.ast),
        ...c.model.tasks.flatMap((t) => [t.ast, ...(t.mentions ?? [])]),
      ];
      const written = tree
        .find((n, t) => t.getAttr(n, 'data-ast') !== undefined)
        .map((n) => tree.getAttr(n, 'data-ast'));
      expect([...written].sort(), c.id).toEqual([...nodes].sort());
    }
  });

  it('declares every theme alias the body uses on the root', () => {
    for (const c of cases) {
      const style = /<svg[^>]* style="([^"]*)"/.exec(c.result.svg)?.[1] ?? '';
      const declared = new Set([...style.matchAll(/(--_[\w-]+):/g)].map((m) => m[1]));
      const sheet = /<style>([^<]*)<\/style>/.exec(c.result.svg)?.[1] ?? '';
      for (const m of sheet.matchAll(/(--_[\w-]+):/g)) declared.add(m[1]);
      const used = new Set([...c.result.svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]));
      for (const name of used) expect(declared, `${c.id}: ${name}`).toContain(name);
    }
  });
});

const fixture = (name: string): JourneyModel => FIXTURES[name]!.model;

describe('journey render: the root (DESIGN §7.2)', () => {
  it('writes the root with viewBox, max-width, role and the type', () => {
    const { svg, tree } = render(fixture('working-day'));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    const r = root(tree);
    expect(classOf(tree, r)).toBe('mermaid mermaid-journey');
    expect(tree.getAttr(r, 'role')).toBe('img');
    expect(tree.getAttr(r, 'aria-roledescription')).toBe('journey');
    expect(tree.getAttr(r, 'data-mermaid-version')).toBe('13.0.0-alpha.0');
    expect(tree.getAttr(r, 'width')).toBe('100%');
    expect(tree.getAttr(r, 'style')).toMatch(/^max-width:\d+px;--_/);
  });

  it('writes width and height instead of max-width when useMaxWidth is off', () => {
    const { tree } = render(fixture('working-day'), { config: { useMaxWidth: false } });
    const r = root(tree);
    const [, , w, h] = tree.getAttr(r, 'viewBox')!.split(' ');
    expect(tree.getAttr(r, 'width')).toBe(w);
    expect(tree.getAttr(r, 'height')).toBe(h);
    expect(tree.getAttr(r, 'style')).not.toMatch(/max-width/);
  });

  it('labels the root from accTitle and accDescr with the only ids', () => {
    const model = { ...fixture('working-day'), accTitle: ' Day ', accDescr: 'How it went' };
    const { svg, tree } = render(model);
    const r = root(tree);
    expect(tree.getAttr(r, 'aria-labelledby')).toBe('mermaid-0-title');
    expect(tree.getAttr(r, 'aria-describedby')).toBe('mermaid-0-desc');
    expect(textIn(tree, tree.find({ tag: 'title' })[0]!)).toBe('Day');
    expect(textIn(tree, tree.find({ tag: 'desc' })[0]!)).toBe('How it went');
    expect([...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1])).toEqual([
      'mermaid-0-title',
      'mermaid-0-desc',
    ]);
  });

  it('draws the parts in v12 order: legend, sections, tasks, title, activity', () => {
    const { tree } = render(fixture('working-day'));
    expect(tree.children(root(tree)).map((n) => classOf(tree, n))).toEqual([
      'legend-entries',
      'sections',
      'tasks',
      'journey-title',
      'activity',
    ]);
  });
});

describe('journey render: sections and tasks', () => {
  it('draws a band per run as <g class="journey-section section-type-n" data-id data-ast>', () => {
    const { tree } = render(fixture('eight-sections'));
    const bands = byClass(tree, 'journey-section');
    expect(bands.map((b) => classOf(tree, b))).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map((n) => `journey-section section-type-${n}`)
    );
    const first = bands[0]!;
    expect(tree.getAttr(first, 'data-ast')).toBe('s:Browse');
    expect(tree.getAttr(first, 'data-id')).toBe('s:Browse');
    expect(tree.children(first).map((n) => tree.tag(n))).toEqual(['rect', 'text']);
    const rect = tree.children(first)[0]!;
    expect(tree.getAttr(rect, 'rx')).toBe('3');
    expect(tree.getAttr(rect, 'stroke')).toBe('#666');
    const label = tree.children(first)[1]!;
    expect(classOf(tree, label)).toBe('section-label');
    expect(tree.getAttr(label, 'data-id')).toBe('s:Browse');
    expect(tree.getAttr(label, 'data-ast')).toBeUndefined();
  });

  it('cycles the nine-section fills over all eight slots (D241)', () => {
    const { tree } = render(fixture('nine-sections'));
    const slots = byClass(tree, 'journey-section').map((b) => classOf(tree, b));
    expect(slots.at(-1)).toBe('journey-section section-type-0');
    expect(slots).toContain('journey-section section-type-7');
  });

  it('gives an empty or folded section line an empty group with its data-ast', () => {
    const simple = render(fixture('simple-test')).tree;
    const [empty] = byAst(simple, 's:Order from website');
    expect(classOf(simple, empty!)).toBe('journey-section empty');
    expect(simple.children(empty!)).toEqual([]);
    // `section Later` twice: the band is the second line's; the first has no band.
    const folded = render(fixture('before-first-section')).tree;
    expect(classOf(folded, byAst(folded, 's:Later')[0]!)).toBe('journey-section empty');
    expect(classOf(folded, byAst(folded, 's:Later@2')[0]!)).toBe('journey-section section-type-0');
  });

  it('draws a task group with line, face, box, dots and name in v12 paint order', () => {
    const { tree } = render(fixture('working-day'));
    const t = byAst(tree, 't:3')[0]!;
    expect(classOf(tree, t)).toBe('task task-type-0');
    expect(tree.getAttr(t, 'data-id')).toBe('t:3');
    const parts = tree.children(t).map((n) => `${tree.tag(n)}.${classOf(tree, n) ?? ''}`);
    expect(parts).toEqual([
      'line.task-line',
      'circle.face',
      'circle.eye',
      'circle.eye',
      'path.mouth mouth-sad',
      'rect.',
      'circle.actor-1',
      'circle.actor-0',
      'text.task-label',
    ]);
    const line = tree.children(t)[0]!;
    expect(tree.getAttr(line, 'stroke-dasharray')).toBe('4 2');
    expect(tree.getAttr(line, 'stroke')).toBe('var(--_tx)');
    const face = tree.children(t)[1]!;
    expect(tree.getAttr(face, 'fill')).toBe('var(--_jfc)');
    expect(tree.getAttr(face, 'stroke')).toBe('#999');
    // v12's tooltip on each actor dot.
    expect(textIn(tree, tree.children(t)[6]!)).toBe('Me');
    expect(byClass(tree, 'task-type-1').map((n) => tree.getAttr(n, 'data-ast'))).toEqual([
      't:4',
      't:5',
    ]);
  });

  it('draws the mouth v12 chose: smile above 3, frown below, flat at 3 and NaN', () => {
    const { tree } = render(fixture('odd-scores'));
    const mouths = byClass(tree, 'mouth').map((n) => classOf(tree, n));
    expect(mouths).toEqual([
      'mouth mouth-flat',
      'mouth mouth-sad',
      'mouth mouth-smile',
      'mouth mouth-sad',
      'mouth mouth-sad',
    ]);
    const flat = byClass(tree, 'mouth-flat')[0]!;
    expect(tree.getAttr(flat, 'fill')).toBe('none');
    expect(tree.getAttr(flat, 'stroke')).toBe('#666');
  });

  it('takes slot 0 before the first section and draws nothing for the empty actor (D244)', () => {
    const { tree } = render(fixture('before-first-section'));
    const early = byAst(tree, 't:1')[0]!;
    expect(classOf(tree, early)).toBe('task task-type-0');
    // `Early: 4: A, , B`: two dots, the second one past the first (no gap for '').
    const dots = tree.children(early).filter((n) => (classOf(tree, n) ?? '').startsWith('actor-'));
    expect(dots.map((n) => [classOf(tree, n), tree.getAttr(n, 'cx')])).toEqual([
      ['actor-0', String(renderLeft(tree) + 14)],
      ['actor-1', String(renderLeft(tree) + 24)],
    ]);
    const legend = byClass(tree, 'legend-entry').map((n) => tree.getAttr(n, 'data-id'));
    expect(legend).toEqual(['a:A', 'a:B']);
  });
});

/** The x the first task starts at, read off its box. */
function renderLeft(tree: SvgTree): number {
  const rect = tree.children(byAst(tree, 't:1')[0]!).find((n) => tree.tag(n) === 'rect')!;
  return Number(tree.getAttr(rect, 'x'));
}

describe('journey render: legend, title and activity line', () => {
  it('writes legend entries with data-id a:<name>, no data-ast, left-aligned text', () => {
    const { tree } = render(fixture('title-styling'));
    const entries = byClass(tree, 'legend-entry');
    expect(entries.map((n) => tree.getAttr(n, 'data-id'))).toEqual(['a:John', 'a:Shahir']);
    for (const e of entries) expect(tree.getAttr(e, 'data-ast')).toBeUndefined();
    const [dot, text] = tree.children(entries[0]!);
    expect(classOf(tree, dot!)).toBe('actor-0');
    expect(tree.getAttr(dot!, 'fill')).toBe('#8FBC8F');
    expect(tree.getAttr(dot!, 'stroke')).toBe('#000');
    expect(classOf(tree, text!)).toBe('legend');
    expect(tree.getAttr(text!, 'text-anchor')).toBe('start');
    expect(tree.getAttr(text!, 'x')).toBe('50');
    expect(tree.getAttr(text!, 'fill')).toBe('var(--_tx)');
  });

  it('colours actors from actorColours, cycling, in the sorted order', () => {
    const many = journey(undefined, section('S'), task('T', 3, 'a', 'b', 'c'));
    const { tree } = render(many, { config: { actorColours: ['#111', '#222'] } });
    const fills = byClass(tree, 'legend-entry').map((e) =>
      tree.getAttr(tree.children(e)[0]!, 'fill')
    );
    expect(fills).toEqual(['#111', '#222', '#111']);
  });

  it('drops an actor or section colour that is not a CSS colour, with a warning', () => {
    const { svg, warnings } = render(fixture('working-day'), {
      config: { actorColours: ['red;x:y', '#123456'], sectionColours: ['url(x)'] },
    });
    expect(svg).not.toContain('red;x:y');
    expect(svg).not.toContain('url(x)');
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['STYLE_VALUE_DROPPED', 'journey.sectionColours'],
      ['STYLE_VALUE_DROPPED', 'journey.actorColours'],
    ]);
  });

  it('colours section and task names from sectionColours only when set (D225)', () => {
    const plain = render(fixture('working-day')).tree;
    for (const n of byClass(plain, 'task-label'))
      expect(plain.getAttr(n, 'fill')).toBe('var(--_tx)');
    const set = render(fixture('working-day'), {
      config: { sectionColours: ['#fff', '#000'] },
    }).tree;
    expect(byClass(set, 'section-label').map((n) => set.getAttr(n, 'fill'))).toEqual([
      '#fff',
      '#000',
    ]);
    expect(byClass(set, 'task-label').map((n) => set.getAttr(n, 'fill'))).toEqual([
      '#fff',
      '#fff',
      '#fff',
      '#000',
      '#000',
    ]);
  });

  it('draws the title bold at (left, 25) in titleColor or textColor (D248)', () => {
    const { tree } = render(fixture('working-day'));
    const title = byClass(tree, 'journey-title')[0]!;
    expect(tree.getAttr(title, 'font-weight')).toBe('700');
    expect(tree.getAttr(title, 'fill')).toBe('var(--_tx)');
    expect(tree.getAttr(title, 'text-anchor')).toBe('start');
    expect(tree.getAttr(title, 'x')).toBe('150');
    const styled = render(fixture('title-styling'), {
      config: FIXTURES['title-styling']!.config,
    }).tree;
    const t2 = byClass(styled, 'journey-title')[0]!;
    expect(styled.getAttr(t2, 'fill')).toBe('#2900A5');
    expect(styled.getAttr(t2, 'font-family')).toBe('Times New Roman');
    expect(styled.getAttr(t2, 'font-size')).toBe('80');
    const bad = render(fixture('working-day'), { config: { titleColor: 'expression(x)' } });
    expect(bad.warnings.map((w) => w.path)).toEqual(['journey.titleColor']);
    expect(bad.tree.getAttr(byClass(bad.tree, 'journey-title')[0]!, 'fill')).toBe('var(--_tx)');
  });

  it('draws the activity line and an inline arrowhead in the line colour (D245)', () => {
    const { tree, svg } = render(fixture('working-day'));
    const [line, head] = tree.children(byClass(tree, 'activity')[0]!);
    expect(tree.getAttr(line!, 'stroke')).toBe('var(--_tx)');
    expect(tree.getAttr(line!, 'stroke-width')).toBe('4');
    expect(tree.getAttr(head!, 'fill')).toBe('var(--_tx)');
    expect(svg).not.toMatch(/<marker|marker-end|url\(#/);
  });

  it('writes the task font on the groups when taskFontFamily or taskFontSize is set', () => {
    const plain = render(fixture('working-day')).tree;
    expect(plain.getAttr(byClass(plain, 'tasks')[0]!, 'font-family')).toBeUndefined();
    const set = render(fixture('working-day'), {
      config: { taskFontFamily: 'Georgia, serif', taskFontSize: 20 },
    }).tree;
    for (const g of [byClass(set, 'tasks')[0]!, byClass(set, 'sections')[0]!]) {
      expect(set.getAttr(g, 'font-family')).toBe('Georgia, serif');
      expect(set.getAttr(g, 'font-size')).toBe('20');
    }
  });

  it('breaks <br> into lines', () => {
    const { tree } = render(fixture('line-breaks'));
    const title = byClass(tree, 'journey-title')[0]!;
    expect(tree.children(title).map((n) => textIn(tree, n))).toEqual(['One', 'two']);
  });

  it('escapes hostile names and stays inert', () => {
    for (const p of PAYLOADS) {
      const model = journey(p, section(p), task(p, 3, p));
      const { svg } = render(model);
      expect(() => assertInert(svg), p).not.toThrow();
      expect(wellFormed(svg), p).toBeUndefined();
    }
  });
});

describe('journey render: theme variables (#327)', () => {
  it('fills the eight section slots from fillType0–7, v12 default theme values', () => {
    const { tree } = render(fixture('eight-sections'), { cssVariables: false });
    const fills = byClass(tree, 'journey-section').map((b) =>
      tree.getAttr(tree.children(b)[0]!, 'fill')
    );
    expect(fills).toEqual([
      '#ececff',
      '#ffffde',
      '#ffecfe',
      '#deffe0',
      '#ecfffe',
      '#ffdee0',
      '#ffefec',
      '#defbff',
    ]);
  });

  it('reads fills, the face and an author actor<n> through the theme', () => {
    const { tree, svg } = render(fixture('working-day'), {
      themeVariables: { fillType1: '#123456', faceColor: '#abcdef', actor1: '#fedcba' },
    });
    const band = byClass(tree, 'section-type-1')[0]!;
    expect(tree.getAttr(tree.children(band)[0]!, 'fill')).toBe('var(--_jf1)');
    expect(svg).toContain('--_jf1:var(--mermaid-fillType1,#123456)');
    expect(tree.getAttr(byClass(tree, 'face')[0]!, 'fill')).toBe('var(--_jfc)');
    // actor1 is set, actor0 is not: actor0 keeps actorColours (D249).
    const dots = byClass(tree, 'legend-entry').map((e) =>
      tree.getAttr(tree.children(e)[0]!, 'fill')
    );
    expect(dots).toEqual(['#8FBC8F', 'var(--_ja1)']);
  });

  it('draws the face in #FFF8DC by default', () => {
    const { tree } = render(fixture('working-day'), { cssVariables: false });
    expect(tree.getAttr(byClass(tree, 'face')[0]!, 'fill')).toBe('#fff8dc');
  });
});
