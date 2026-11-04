import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import {
  createMermaid,
  UnsupportedFormatError,
  type MermaidError,
  type RenderResult,
} from 'mermaid';
import { REPO_ROOT } from './index.ts';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

// The class plugin is not in the generated registry until #157: see class/test-registry.ts.
vi.mock('../../mermaid/src/generated/registry.gen.ts', async (original) =>
  (await import('./class/test-registry.ts')).withClass(await original())
);

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
    expect(attr(tree, count, 'text-decoration')).toBe('underline');
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
        const sw = parseFloat(attr(tree, m, 'stroke-width') ?? 'NaN');
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

  it('puts relationship labels on classEdgeLabelBackground: mainBkg classic, edgeLabelBackground redux', async () => {
    const label = async (theme: string) => {
      const m = createMermaid();
      m.initialize({ deterministic: true, theme, output: { cssVariables: false } } as never);
      const tree = parseSvg((await m.render('x', src)).svg);
      return attr(tree, tree.find({ class: 'edgeLabel' })[0]!.children[0]!, 'fill');
    };
    expect(await label('default')).toBe('#ececff');
    expect(await label('redux')).toBe('#cccccc');
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
