import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import {
  createMermaid,
  UnsupportedFormatError,
  type MermaidError,
  type RenderResult,
} from 'mermaid';
import { REPO_ROOT } from './index.ts';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

// The class renderer (spec #126 T4) through the public `render()`.

async function draw(
  source: string,
  config: Record<string, unknown> = {}
): Promise<RenderResult & { tree: SvgView }> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config } as never);
  const r = await m.render('mermaid-0', source);
  return { ...r, tree: parseSvg(r.svg) };
}

const attr = (t: SvgView, n: SvgElement, name: string) => t.getAttr(n, name);
const byId = (t: SvgView, id: string) =>
  t.find((n, v) => v.getAttr(n, 'data-id') === id && v.getAttr(n, 'data-ast') !== undefined)[0];
const classOf = (t: SvgView, n: SvgElement) => (attr(t, n, 'class') ?? '').split(' ');
/** The text an element holds, its tspans' included. */
const textIn = (t: SvgView, n: SvgElement): string =>
  n.tag === undefined
    ? (n.text ?? '')
    : t
        .children(n)
        .map((c) => textIn(t, c))
        .join('');

describe('class render: formats (D100)', () => {
  it('draws SVG only', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('class', 'svg')).toBe(true);
    expect(m.supportsFormat('class', 'ascii')).toBe(false);
    expect(m.supportsFormat('classDiagram', 'ascii')).toBe(false);
    const e = await m.render('x', 'classDiagram\nclass A', { format: 'ascii' }).then(
      () => undefined,
      (x: unknown) => x
    );
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as MermaidError).code).toBe('UNSUPPORTED_FORMAT');
  });
});

describe('class render: structure', () => {
  const src = [
    'classDiagram',
    'accTitle: Zoo',
    'accDescr: Animals',
    'namespace Zoo {',
    '  class Animal~T~ {',
    '    <<interface>>',
    '    +String name',
    '    +count()$ int',
    '    +move()*',
    '  }',
    '}',
    'class Duck',
    'Animal <|-- Duck : is a',
    'Animal "1" *-- "many" Duck',
    'Duck ..> Animal',
    'Duck --() Swim',
    'note for Duck "quacks"',
  ].join('\n');

  it('writes the v12 groups in order, with only the title and description as ids', async () => {
    const { tree } = await draw(src);
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(attr(tree, root, 'class')).toBe('mermaid mermaid-class');
    expect(attr(tree, root, 'aria-roledescription')).toBe('classDiagram');
    const groups = tree.children(root).filter((n) => tree.tag(n) === 'g');
    expect(groups.map((g) => attr(tree, g, 'class'))).toEqual([
      'clusters',
      'edgePaths',
      'edgeLabels',
      'nodes',
    ]);
    const ids = tree
      .find((n, t) => t.getAttr(n, 'id') !== undefined)
      .map((n) => attr(tree, n, 'id'));
    expect(ids.sort()).toEqual(['mermaid-0-desc', 'mermaid-0-title']);
  });

  it('draws a class as a box with its header, dividers and member rows', async () => {
    const { tree } = await draw(src);
    const box = byId(tree, 'Animal')!;
    expect(attr(tree, box, 'data-ast')).toBe('n:Animal');
    const kids = tree.children(box);
    const texts = kids.filter((n) => tree.tag(n) === 'text');
    expect(texts.map((n) => textIn(tree, n))).toEqual([
      '«interface»',
      'Animal<T>',
      '+String name',
      '+count() : int',
      '+move()',
    ]);
    expect(kids.filter((n) => classOf(tree, n).includes('divider'))).toHaveLength(2);
    const [name, count, move] = [texts[1]!, texts[3]!, texts[4]!];
    expect(
      tree.find((n, t) => t.getAttr(n, 'font-weight') === 'bold' && isIn(n, name))
    ).not.toEqual([]);
    expect(
      tree.find((n, t) => t.getAttr(n, 'text-decoration') === 'underline' && isIn(n, count))
    ).not.toEqual([]);
    expect(attr(tree, count, 'data-ast')).toBe('m:Animal#2');
    expect(
      tree.find((n, t) => t.getAttr(n, 'font-style') === 'italic' && isIn(n, move))
    ).not.toEqual([]);
  });

  it('draws relationships with their markers, labels and multiplicities', async () => {
    const { tree } = await draw(src);
    const edges = tree.find((n, t) => (t.getAttr(n, 'class') ?? '').startsWith('edge relation'));
    expect(edges.map((e) => attr(tree, e, 'data-id'))).toEqual([
      'edgeNote0',
      'id_Animal_Duck_1',
      'id_Animal_Duck_2',
      'id_Duck_Animal_3',
      'id_Duck_interface0_4',
    ]);
    const markers = (e: SvgElement) =>
      tree
        .children(e)
        .flatMap((n) =>
          classOf(tree, n).filter((c) => c !== 'marker' && classOf(tree, n).includes('marker'))
        );
    expect(edges.map(markers)).toEqual([
      [],
      ['extension'],
      ['composition'],
      ['dependency'],
      ['lollipop'],
    ]);
    const path = (e: SvgElement) => tree.children(e).find((n) => tree.tag(n) === 'path')!;
    expect(attr(tree, path(edges[0]!), 'stroke-dasharray')).toBe('2');
    expect(attr(tree, path(edges[1]!), 'stroke-dasharray')).toBeUndefined();
    expect(attr(tree, path(edges[3]!), 'stroke-dasharray')).toBe('3');
    const labels = tree.find({ class: 'edgeLabel' });
    expect(
      labels.map((l) => textIn(tree, tree.children(l).find((n) => tree.tag(n) === 'text')!))
    ).toEqual(['is a']);
    const ends = tree.find({ class: 'edgeTerminals' })[0]!;
    expect(tree.children(ends).map((n) => textIn(tree, n))).toEqual(['1', 'many']);
  });

  it('draws notes, interfaces and namespaces with their AST ids', async () => {
    const { tree } = await draw(src);
    expect(attr(tree, byId(tree, 'note0')!, 'data-ast')).toBe('note:1');
    expect(
      textIn(tree, tree.children(byId(tree, 'note0')!).find((n) => tree.tag(n) === 'text')!)
    ).toBe('quacks');
    expect(attr(tree, byId(tree, 'interface0')!, 'data-ast')).toBe('i:Swim');
    const ns = byId(tree, 'Zoo')!;
    expect(classOf(tree, ns)).toContain('cluster');
    expect(attr(tree, ns, 'data-ast')).toBe('s:Zoo');
  });

  it('keeps every end marker within 12 px across the line, outline included', async () => {
    const all = ['<|--', '*--', 'o--', '-->', '..>', '--()'];
    for (const theme of ['redux-color', 'default']) {
      for (const arrow of all) {
        const { tree } = await draw(`classDiagram\nA ${arrow} B`, {
          theme,
          output: { cssVariables: false },
        });
        const m = tree.find((n, t) => (t.getAttr(n, 'class') ?? '').startsWith('marker '))[0]!;
        // A filled redux marker has no outline.
        const sw = parseFloat(attr(tree, m, 'stroke-width') ?? '0');
        const xs: number[] = [];
        if (tree.tag(m) === 'circle') {
          const cx = Number(attr(tree, m, 'cx'));
          const r = Number(attr(tree, m, 'r'));
          xs.push(cx - r, cx + r);
        } else {
          const nums = (attr(tree, m, 'd') ?? '').match(/-?[\d.]+/g)!.map(Number);
          for (let i = 0; i < nums.length; i += 2) xs.push(nums[i]!);
        }
        // `A … B` runs top to bottom, so across is x.
        const across = Math.max(...xs) - Math.min(...xs) + sw;
        expect(across, `${theme} ${arrow}`).toBeLessThanOrEqual(12 + 1e-6);
      }
    }
  });
});

describe('class render: marker geometry per family (D152)', () => {
  // `A <|-- B` runs top to bottom with the marker under A: [tip gap, length, outline] for each
  // family, from v12's classic markers and its `look: neo` `-margin` variants.
  const cases: [string, string, string, number, number, number][] = [
    ['redux-color', '<|--', 'extension', 8.25, 8, 2],
    ['default', '<|--', 'extension', 0.25, 17, 1],
    ['redux-color', '*--', 'composition', 2.75, 17, 0],
    ['default', '*--', 'composition', 0.25, 17, 1],
    ['redux-color', 'o--', 'aggregation', 0.25, 17, 2],
    ['default', 'o--', 'aggregation', 0.25, 17, 1],
  ];
  it.each(cases)(
    '%s %s: %s tip gap %d, length %d, outline %d',
    async (theme, arrow, type, gap, len, sw) => {
      const { tree } = await draw(`classDiagram\nA ${arrow} B`, {
        theme,
        output: { cssVariables: false },
      });
      const m = tree.find((n, t) => t.getAttr(n, 'class') === `marker ${type}`)[0]!;
      expect(parseFloat(attr(tree, m, 'stroke-width') ?? '0')).toBe(sw);
      const box = byId(tree, 'A')!;
      const [, ty] = /translate\(([-\d.]+),([-\d.]+)\)/
        .exec(attr(tree, box, 'transform')!)!
        .slice(1)
        .map(Number);
      const rect = tree.children(box).find((n) => tree.tag(n) === 'rect')!;
      const bottom = ty! + Number(attr(tree, rect, 'height'));
      const ys = (attr(tree, m, 'd') ?? '')
        .match(/-?[\d.]+/g)!
        .map(Number)
        .filter((_, i) => i % 2 === 1);
      // The tip's outline reaches the gap; the path's points sit half an outline inside it.
      expect(Math.min(...ys) - bottom).toBeCloseTo(gap + sw / 2, 1);
      expect(Math.max(...ys) - bottom).toBeCloseTo(gap + len, 1);
    }
  );

  it('reads the marker variables, so themeVariables override them', async () => {
    const { tree } = await draw('classDiagram\nA <|-- B', {
      theme: 'default',
      themeVariables: { extensionMarkerLength: 10, classMarkerStrokeWidth: 3 },
      output: { cssVariables: false },
    });
    const m = tree.find((n, t) => t.getAttr(n, 'class') === 'marker extension')[0]!;
    expect(attr(tree, m, 'stroke-width')).toBe('3');
    const ys = (attr(tree, m, 'd') ?? '')
      .match(/-?[\d.]+/g)!
      .map(Number)
      .filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10 - 1.5, 1);
  });
});

describe('class render: review fixes', () => {
  it('starts every member row at the same left edge', async () => {
    const { tree } = await draw('classDiagram\nclass A {\n+List~int~ items\n-x$\n+move()*\n}');
    const rows = tree.find((n, t) => (t.getAttr(n, 'class') ?? '').startsWith('member'));
    expect(rows).toHaveLength(3);
    const starts = rows.map((r) => {
      const at = attr(tree, r, 'x') !== undefined ? r : tree.children(r)[0]!;
      return [attr(tree, r, 'text-anchor'), attr(tree, at, 'x')];
    });
    expect(new Set(starts.map((s) => JSON.stringify(s))).size, JSON.stringify(starts)).toBe(1);
    expect(starts[0]![0]).toBe('start');
  });

  it('checks each classDef declaration once', async () => {
    const { warnings, tree } = await draw(
      'classDiagram\nclass A:::hot\nclass B\nclassDef hot fill:#f00,stroke:url(x)\ncssClass "B" hot'
    );
    const dropped = warnings.filter((w) => w.code === 'STYLE_VALUE_DROPPED');
    expect(dropped).toHaveLength(1);
    const rectOf = (id: string) =>
      tree.children(byId(tree, id)!).find((n) => tree.tag(n) === 'rect')!;
    expect(attr(tree, rectOf('A'), 'fill')).toBe('#f00');
    expect(attr(tree, rectOf('B'), 'fill')).toBe('#f00');
  });

  it('draws class text in classText (v12), so a themeVariables override reaches it', async () => {
    const { tree } = await draw('classDiagram\nclass A\nA --> B : x', {
      theme: 'default',
      themeVariables: { classText: '#ff0000' },
      output: { cssVariables: false },
    });
    const nodes = tree.find({ class: 'nodes' })[0]!;
    expect(attr(tree, nodes, 'fill')).toBe('#ff0000');
    const label = tree.find({ class: 'edgeLabel' })[0]!;
    expect(attr(tree, tree.children(label).find((n) => tree.tag(n) === 'text')!, 'fill')).toBe(
      '#ff0000'
    );
  });

  it('gives a relationship one data-id on its line, label and multiplicities', async () => {
    const { tree } = await draw('classDiagram\nA "1" --> "*" B : has');
    const ids = ['edge relation', 'edgeLabel', 'edgeTerminals'].map((c) =>
      tree
        .find(
          (n, t) =>
            (t.getAttr(n, 'class') ?? '').split(' ')[0] === c.split(' ')[0] &&
            (t.getAttr(n, 'class') ?? '').startsWith(c)
        )
        .map((n) => attr(tree, n, 'data-id'))
    );
    expect(ids).toEqual([['id_A_B_1'], ['id_A_B_1'], ['id_A_B_1']]);
    const edge = tree.find((n, t) => (t.getAttr(n, 'class') ?? '').startsWith('edge relation'))[0]!;
    expect(classOf(tree, edge)).toContain('edge-thickness-normal');
  });

  it('draws multiplicities at classTerminalFontSize, 11px as in v12', async () => {
    const { tree } = await draw('classDiagram\nA "1" --> "*" B', {
      output: { cssVariables: false },
    });
    expect(attr(tree, tree.find({ class: 'edgeTerminals' })[0]!, 'font-size')).toBe('11');
  });
});

function isIn(n: SvgElement, root: SvgElement): boolean {
  for (let p: SvgElement | undefined = n; p; p = p.parent) if (p === root) return true;
  return false;
}

describe('class render: themes (D152, R-THEME-11)', () => {
  const src = 'classDiagram\nclass A\nclass B\nA <|-- B : x';

  it('takes palette slots in redux-color, by declaration order', async () => {
    const { tree } = await draw(src);
    expect(attr(tree, byId(tree, 'A')!, 'data-color-id')).toBe('color-0');
    expect(attr(tree, byId(tree, 'B')!, 'data-color-id')).toBe('color-1');
    const rect = tree.children(byId(tree, 'A')!).find((n) => tree.tag(n) === 'rect')!;
    expect(attr(tree, rect, 'filter')).toMatch(/var\(--_ds/);
  });

  it('draws the classic themes without palette or shadow', async () => {
    const { tree } = await draw(src, { theme: 'default' });
    expect(attr(tree, byId(tree, 'A')!, 'data-color-id')).toBeUndefined();
    const rect = tree.children(byId(tree, 'A')!).find((n) => tree.tag(n) === 'rect')!;
    expect(attr(tree, rect, 'filter')).toBeUndefined();
  });

  it('puts relationship labels on the theme background in every theme (D621)', async () => {
    const label = async (theme: string) => {
      const m = createMermaid();
      m.initialize({ deterministic: true, theme, output: { cssVariables: false } } as never);
      const tree = parseSvg((await m.render('x', src)).svg);
      return attr(tree, tree.find({ class: 'edgeLabel' })[0]!.children[0]!, 'fill');
    };
    expect(await label('default')).toBe('#ffffff');
    expect(await label('dark')).toBe('#333333');
    expect(await label('redux')).toBe('#ffffff');
  });

  it('never reads a theme name or look', () => {
    const dir = join(REPO_ROOT, 'packages/diagram-class/src/render');
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text, f).not.toMatch(
        /['"](redux[\w-]*|neo|classic|forest|neutral)['"]|\.look\b|theme\.name/
      );
    }
  });
});

describe('class render: styles, links and tooltips', () => {
  it('applies style and classDef as presentation attributes, the author over the palette', async () => {
    const { tree, warnings } = await draw(
      'classDiagram\nclass A:::hot\nclass B\nclassDef hot fill:#f00\nstyle B stroke:#00f,behavior:x'
    );
    const rectOf = (id: string) =>
      tree.children(byId(tree, id)!).find((n) => tree.tag(n) === 'rect')!;
    expect(attr(tree, rectOf('A'), 'fill')).toBe('#f00');
    expect(attr(tree, rectOf('B'), 'stroke')).toBe('#00f');
    expect(classOf(tree, byId(tree, 'A')!)).toContain('hot');
    expect(warnings.map((w) => w.code)).toContain('STYLE_PROPERTY_DROPPED');
  });

  it('links a class through the URL check, with its tooltip as a title', async () => {
    const { tree } = await draw(
      'classDiagram\nclass A\nclass B\nlink A "https://example.com" "go"\nlink B "javascript:alert(1)"'
    );
    const a = tree.find({ tag: 'a' });
    expect(a.map((n) => attr(tree, n, 'href'))).toEqual(['https://example.com']);
    expect(attr(tree, a[0]!, 'target')).toBe('_blank');
    const title = tree.children(byId(tree, 'A')!).find((n) => tree.tag(n) === 'title')!;
    expect(textIn(tree, title)).toBe('go');
  });

  it('escapes markup in names, labels and members (no sanitiser)', async () => {
    const r = await draw(
      'classDiagram\nclass A["<img src=x onerror=alert(1)>"]\nA : +List<T> items\nA --> B : <script>x</script>'
    );
    expect(() => assertInert(r.svg)).not.toThrow();
    expect(r.svg).not.toMatch(/<img|<script/);
    const texts = r.tree.find({ tag: 'text' }).map((n) => textIn(r.tree, n));
    expect(texts).toContain('+List<T> items');
  });
});
