// The usecase renderer (spec #517 T4) through the plugin's own seam: `.mmd` fixtures parsed,
// laid out and drawn with core's render context (`renderUsecaseForTest`). Structure, v12's
// classes, AST marks and accessibility (D475), the drawn title (D472), stereotypes, markers as
// paths, role colours and palette slots (D474, `colorScheme: rotate`), author styles, icons and
// the `w.outline` hook (D302); v12's `usecaseRenderer.spec.ts` names, ported. The corpus
// properties are `conformance/src/usecase/render.spec.ts` and the colours against v12 in every
// theme `conformance/src/usecase/theme.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineDraw, OutlineRole, OutlineTag } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';
import { pxProfile } from '@mermaid-js/core/layout';
import { renderUsecaseForTest, type RenderUsecaseOptions } from './harness.ts';

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;
/** Vite's `import.meta.glob` (Vitest runs it) reads the files: the package needs no Node types. */
const FIXTURES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/usecase/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);
/** An e2e fixture, `e2e/diagrams/usecase/<path>.mmd`. */
function fixture(path: string): string {
  const text = FIXTURES[`../../../../e2e/diagrams/usecase/${path}.mmd`];
  if (text === undefined) throw new Error(`no fixture ${path}`);
  return text;
}

const render = (path: string, options?: RenderUsecaseOptions) =>
  renderUsecaseForTest(fixture(path), options);
/** A theme with no palette, written as variables (`var(--_x)`). */
const plain = { config: { theme: 'default' } };

/** Every `<tag>` start tag's attributes, in document order. */
function elements(svg: string, tag = '[a-zA-Z]+'): (Record<string, string> & { tag: string })[] {
  const out: (Record<string, string> & { tag: string })[] = [];
  for (const m of svg.matchAll(new RegExp(`<(${tag})\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> & { tag: string } = { tag: m[1]! };
    for (const a of m[2]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = decode(a[2]!);
    out.push(attrs);
  }
  return out;
}

/** An attribute value's character references, decoded. */
const decode = (v: string): string =>
  v
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const hasClass = (e: Record<string, string>, c: string): boolean =>
  (e.class ?? '').split(' ').includes(c);
const byClass = (svg: string, c: string, tag?: string) =>
  elements(svg, tag).filter((e) => hasClass(e, c));
/** The group with `data-id` `id` and class `c`. */
const group = (svg: string, c: string, id: string) =>
  byClass(svg, c, 'g').find((e) => e['data-id'] === id)!;

/** Each `<text>` with its class, data-id, fill and its character data. */
function texts(svg: string): { cls: string; id?: string; fill?: string; text: string }[] {
  return [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)].map((m) => {
    const attr = (k: string) => new RegExp(`\\s${k}="([^"]*)"`).exec(m[1]!)?.[1];
    return {
      cls: attr('class') ?? '',
      id: attr('data-id'),
      fill: attr('fill'),
      text: m[2]!.replace(/<[^>]+>/g, ''),
    };
  });
}

/** The markup of the element group `<g … data-id="id" …>` with class `c`, to its end. */
function inside(svg: string, c: string, id: string): string {
  const start = svg.search(new RegExp(`<g class="[^"]*\\b${c}\\b[^"]*"[^>]*data-id="${id}"`));
  if (start < 0) throw new Error(`no ${c} ${id}`);
  let depth = 0;
  for (const m of svg.slice(start).matchAll(/<(\/?)g\b[^>]*?(\/?)>/g)) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return svg.slice(start, start + m.index + m[0].length);
  }
  throw new Error('unclosed');
}

describe('structure (spec #517 Renderer)', () => {
  it('writes the root, then clusters, edge paths, edge labels and nodes, in v12’s order', async () => {
    const { svg } = await render('nightly-check/20-full-featured-order-system', plain);
    expect(svg).toMatch(
      /^<svg [^>]*class="mermaid mermaid-usecase"[^>]*role="img"[^>]*aria-roledescription="usecase"/
    );
    const order = ['clusters', 'edgePaths', 'edgeLabels', 'nodes'].map((c) =>
      svg.indexOf(`<g class="${c}"`)
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(svg).not.toMatch(/foreignObject|<style|<defs|<marker|NaN|undefined/);
  });

  it('writes no element id but <prefix>-title and -desc (D475)', async () => {
    const { svg, model } = await render('nightly-check/10-configuration-and-accessibility');
    expect(model.accTitle).not.toBe('');
    const ids = elements(svg).flatMap((e) => (e.id ? [`${e.tag}#${e.id}`] : []));
    expect(ids).toEqual(['title#mermaid-0-title', 'desc#mermaid-0-desc']);
    expect(svg).toMatch(/aria-labelledby="mermaid-0-title"[^>]*aria-describedby="mermaid-0-desc"/);
  });

  it('puts data-ast on each element’s and relationship’s group only, data-id on its parts', async () => {
    const { svg, model } = await render('pr-check/small-representative-visual-snapshot', plain);
    const marked = elements(svg).filter((e) => e['data-ast'] !== undefined);
    const expected = [
      ...model.actors,
      ...model.useCases,
      ...model.boundaries,
      ...model.notes,
      ...model.jsonTables,
      ...model.relationships,
    ].map((e) => e.astId);
    expect(marked.map((e) => e['data-ast']).sort()).toEqual([...expected].sort());
    expect(marked.every((e) => e.tag === 'g' && e['data-id'] !== undefined)).toBe(true);
    for (const t of elements(svg, 'text')) {
      expect(t['data-ast']).toBeUndefined();
      expect(t['data-id']).toBeDefined();
    }
  });

  it('keeps v12’s classes for every kind of element', async () => {
    const { svg } = await render('pr-check/small-representative-visual-snapshot', plain);
    const classOf = (id: string) => elements(svg, 'g').find((e) => e['data-id'] === id)!.class;
    expect(classOf('Normal')).toBe('node default usecase-actor usecase-actor-normal');
    expect(classOf('Hollow')).toBe(
      'node default usecase-actor usecase-actor-hollow usecase-business'
    );
    expect(classOf('Icon')).toBe('node default usecase-actor usecase-actor-icon');
    expect(classOf('Login')).toBe('node default usecase-element usecase-ellipse critical');
    expect(classOf('Reset')).toBe('node default usecase-element usecase-rect');
    expect(classOf('Checkout')).toBe(
      'node default usecase-element usecase-ellipse usecase-business'
    );
    expect(classOf('note-0')).toBe('node default usecase-note');
    expect(classOf('Payload')).toBe('node default usecase-json-table');
    expect(classOf('Authentication_System')).toBe(
      'cluster usecase-system-boundary usecase-system-boundary-package default system-boundary system-boundary-package framed'
    );
    expect(classOf('assocRel')).toBe(
      'relationship relationship-association emphasized edge-animation-fast'
    );
    expect(classOf('includeRel')).toBe('relationship relationship-include');
    expect(classOf('note-0-edge')).toBe('relationship relationship-note');
    for (const c of [
      'usecase-actor-glyph',
      'usecase-stereotype',
      'usecase-business-marker',
      'boundary-body',
      'boundary-tab',
      'system-boundary-title',
    ])
      expect(byClass(svg, c).length, c).toBeGreaterThan(0);
  });

  it('sizes the root to the layout, and to its width with useMaxWidth off', async () => {
    const { svg, layout } = await render('nightly-check/01-basic-use-cases');
    const [w, h] = [Math.ceil(layout.width), Math.ceil(layout.height)];
    expect(svg).toContain(`viewBox="0 0 ${w} ${h}"`);
    expect(svg).toMatch(new RegExp(`width="100%"[^>]*style="max-width:${w}px`));
    const fixed = await render('nightly-check/01-basic-use-cases', {
      config: { usecase: { useMaxWidth: false } },
    });
    expect(fixed.svg).toMatch(new RegExp(`width="${w}" height="${h}"`));
  });
});

describe('the front-matter title (D472)', () => {
  it('draws it as usecaseDiagramTitleText above the diagram, not as the accessible name', async () => {
    const { svg, layout } = await render('nightly-check/parser-front-matter-title');
    const title = texts(svg).find((t) => t.cls === 'usecaseDiagramTitleText')!;
    expect(title).toMatchObject({ text: 'Shop', id: 'title' });
    const band = layout.usecase!.title!.height + layout.usecase!.config.diagramPadding;
    // eslint-disable-next-line mermaid/no-nested-quantifier -- run on one formatted number
    expect(svg).toContain(`<g transform="translate(0,${band.toFixed(2).replace(/\.?0+$/, '')})">`);
    const height = Math.ceil(layout.height + band);
    expect(svg).toMatch(new RegExp(`viewBox="0 0 \\d+ ${height}"`));
    expect(svg).not.toMatch(/aria-labelledby|<title/);
  });

  it('draws no title band without one', async () => {
    const { svg } = await render('nightly-check/01-basic-use-cases');
    expect(svg).not.toContain('usecaseDiagramTitleText');
    expect(svg).not.toMatch(/<g transform="translate\(/);
  });
});

describe('labels', () => {
  it('drops a tag it does not draw from a plain label, and writes no element for it (D471, D735)', async () => {
    const { svg } = await render('pr-check/small-representative-visual-snapshot');
    // The decoded `Hostile("<img …>")`: an HTML tag core drops, so the use case draws no text.
    expect(texts(inside(svg, 'node', 'Hostile')).map((t) => t.text.trim())).toEqual(['']);
    expect(svg).not.toMatch(/<img\b/);
  });

  it('draws tags and a written \\n in every label kind, and markdown only in a markdown string (D735)', async () => {
    const { svg, layout } = await render('pr-check/label-syntax');
    // Each line as laid out (a long label also wraps), and the runs as drawn.
    const label = (id: string) => {
      const v = [...layout.usecase!.nodes.values()].find(
        (n) => n.kind === 'usecase' && n.useCase.id === id
      );
      if (v?.kind !== 'usecase') throw new Error(id);
      return v.label.lines.map((runs) => runs.map((r) => r.text).join(''));
    };
    expect(label('U1').join(' ')).toBe('usecase **bold** _ital_');
    // Plain markers, bare backticks and a code span in plain text are drawn as written.
    expect(label('U3').join(' ')).toBe('`usecase **bold** _ital_`');
    expect(label('U4').join(' ')).toBe('usecase a `code` b');
    // A markdown string: bold and italic runs, no markers.
    expect(label('U2').join(' ')).toBe('usecase bold ital');
    expect(inside(svg, 'node', 'U2')).toMatch(/font-weight="bold"[^>]*>bold</);
    // Tags draw, `<br>` and a written `\n` break the line.
    expect(label('U5').at(-1)).toBe('next H2O');
    expect(inside(svg, 'node', 'U5')).toMatch(/font-weight="bold"[^>]*>bold</);
    expect(inside(svg, 'node', 'S5')).toMatch(/font-style="italic"[^>]*>ital</);
    expect(label('U6')).toEqual(['usecase one', 'two']);
    expect(svg).not.toMatch(/&lt;b&gt;|\\n/);
  });

  it('draws the same with legacyMarkdown: no usecase label kind read v12 markdown (D734)', async () => {
    const { svg } = await render('pr-check/label-syntax');
    const legacy = await render('pr-check/label-syntax', { config: { legacyMarkdown: true } });
    expect(legacy.svg).toBe(svg);
  });

  it('draws a stereotype as a first line «s» above the label, for actors and use cases', async () => {
    const { svg } = await render('pr-check/small-representative-visual-snapshot');
    const of = (id: string) => texts(inside(svg, 'node', id)).map((t) => [t.cls, t.text]);
    expect(of('Normal')).toEqual([
      ['usecase-stereotype', '«Human»'],
      ['actor-label usecase-actor-label', 'Normal User'],
    ]);
    expect(of('Login')[0]).toEqual(['usecase-stereotype', '«Main»']);
    expect(of('Login')[1]![0]).toBe('usecase-label');
    expect(of('Checkout')).toEqual([
      ['usecase-stereotype', '«Core»'],
      ['usecase-label', 'Checkout'],
    ]);
  });

  it('labels include and extend «include» and «extend» at 10px, an association with its text', async () => {
    const { svg } = await render('nightly-check/06-uml-relationships');
    const labels = texts(svg).filter((t) => t.cls === 'relationship-label');
    expect(labels.map((t) => t.text).sort()).toEqual(['«extend»', '«include»']);
    expect(byClass(svg, 'relationship-label', 'text').every((t) => t['font-size'] === '10')).toBe(
      true
    );
    expect(svg.match(/<g class="edgeLabel"/g)).toHaveLength(2);
  });

  it('draws each label as a tag bordered 1 px solid in its line colour (D626, D627)', async () => {
    const { svg, layout } = await render('baseline/edge-labels/tags', plain);
    const prepared = layout.usecase!;
    const patch = pxProfile.builder.labelPatch;
    const lines = new Map(
      elements(svg, 'g')
        .filter((g) => g.class?.startsWith('relationship '))
        .map((g) => [g['data-id']!, g])
    );
    const strokeOf = (id: string): string | undefined => {
      const at = svg.indexOf(`data-id="${id}"`);
      const path = elements(svg.slice(at), 'path')[0]!;
      return path.stroke ?? lines.get(id)?.stroke ?? 'var(--_l)';
    };
    const tags = svg
      .split('<g class="edgeLabel"')
      .slice(1)
      .map((part) => ({
        id: /data-id="([^"]*)"/.exec(part)![1]!,
        box: elements(part, 'rect')[0]!,
      }));
    expect(tags).toHaveLength(6);
    for (const { id, box } of tags) {
      expect(box.rx, id).toBe('6');
      expect(box['stroke-width'], id).toBe('1');
      expect(box['stroke-dasharray'], id).toBeUndefined();
      expect(box.stroke, id).toBe(strokeOf(id));
      const view = prepared.edges.find((e) => e.kind === 'relation' && e.relationship.id === id);
      if (view?.kind !== 'relation') throw new Error(`no relation ${id}`);
      // The box is the label plus the px profile's labelPatch (D629).
      expect(Number(box.width), id).toBeCloseTo(view.label!.width + patch.x);
      expect(Number(box.height), id).toBeCloseTo(view.label!.height + patch.y);
      expect(layout.edges.get(view.id)?.label, id).toBeDefined();
    }
    const styled = tags.find((t) => t.id === 'styledEdge')!;
    expect(styled.box.stroke).toBe('#d6336c');
  });

  it('draws no box and reserves no room for a whitespace-only label (D626)', async () => {
    const { svg, layout } = await renderUsecaseForTest(
      'usecase-beta\n  actor A\n  B\n  A -- " " ---> B\n',
      plain
    );
    expect(svg).not.toContain('<g class="edgeLabel"');
    const bare = await renderUsecaseForTest('usecase-beta\n  actor A\n  B\n  A ---> B\n', plain);
    const view = layout.usecase!.edges[0]!;
    expect(view.kind === 'relation' && view.label).toBeFalsy();
    expect([layout.width, layout.height]).toEqual([bare.layout.width, bare.layout.height]);
  });

  it('draws markdown labels through core label layout, as runs (D225)', async () => {
    const { svg } = await render('pr-check/small-representative-visual-snapshot');
    expect(inside(svg, 'node', 'Login')).toMatch(/font-weight="bold"[^>]*>Sign in/);
    // `"**Literal markers**"` is plain text: the asterisks stay.
    expect(texts(inside(svg, 'node', 'Literal'))[0]!.text).toBe('**Literal markers**');
  });
});

describe('relationships', () => {
  it('draws v12’s point, circle and cross markers as paths at the right ends', async () => {
    const { svg } = await render('nightly-check/05-association-markers', plain);
    const markers = (id: string) =>
      byClass(inside(svg, 'relationship', id), 'marker').map((m) => [m.tag, m.class]);
    const ids = elements(svg, 'g')
      .filter((e) => hasClass(e, 'relationship'))
      .map((e) => e['data-id']!);
    expect(ids).toEqual(['edge-0', 'edge-1', 'edge-2', 'edge-3', 'edge-4', 'edge-5', 'edge-6']);
    expect(ids.map(markers)).toEqual([
      [['path', 'marker point']],
      [['path', 'marker point']],
      [],
      [['path', 'marker circle']],
      [['path', 'marker circle']],
      [['path', 'marker cross']],
      [['path', 'marker cross']],
    ]);
  });

  it('draws a generalization’s hollow triangle filled mainBkg, include and extend dashed in their colours', async () => {
    const { svg } = await render('nightly-check/06-uml-relationships', plain);
    const ext = byClass(svg, 'extension', 'path');
    expect(ext).toHaveLength(2);
    expect(ext[0]).toMatchObject({ fill: 'var(--_mb)', stroke: 'var(--_l)' });
    const line = (id: string) =>
      elements(inside(svg, 'relationship', id), 'path').find((p) => !hasClass(p, 'marker'))!;
    // edge-0 and edge-3 are generalizations, edge-1 includes, edge-2 extends.
    expect(line('edge-1')).toMatchObject({ stroke: 'var(--_uil)', 'stroke-dasharray': '3' });
    expect(line('edge-2')).toMatchObject({ stroke: 'var(--_uel)', 'stroke-dasharray': '3' });
    expect(line('edge-0')['stroke-dasharray']).toBeUndefined();
    expect(line('edge-0').stroke).toBeUndefined();
  });

  it('hides a note’s connector from assistive technology and names each relationship (v12)', async () => {
    const { svg } = await render('pr-check/small-representative-visual-snapshot');
    const path = (id: string) =>
      elements(inside(svg, 'relationship', id), 'path').find((p) => !hasClass(p, 'marker'))!;
    expect(path('note-0-edge')).toMatchObject({ 'aria-hidden': 'true', 'stroke-dasharray': '3' });
    expect(path('note-0-edge').role).toBeUndefined();
    expect(path('includeRel')).toMatchObject({
      role: 'img',
      'aria-label': 'include from Sign in\nsecurely to Payment',
    });
    expect(path('extendRel')['aria-label']).toBe('extend from Optional flow to Sign in\nsecurely');
    expect(path('assocRel')['aria-label']).toBe(
      'association opens session from Normal User to Sign in\nsecurely'
    );
    // The author's style wins on the line, and its markers take its stroke.
    expect(path('assocRel')).toMatchObject({ stroke: '#2aa198', 'stroke-width': '5px' });
    expect(group(svg, 'relationship', 'assocRel')['data-ast']).toBe('rel:assocRel');
    expect(group(svg, 'relationship', 'note-0-edge')['data-ast']).toBeUndefined();
  });

  it('rounds an animated line’s caps and moves its 9,5 dashes, fast or slow (D606)', async () => {
    const { svg } = await render('nightly-check/15-animation-variants');
    const animated = elements(svg, 'g').filter((e) =>
      /edge-animation-(fast|slow)/.test(e.class ?? '')
    );
    expect(animated.length).toBeGreaterThan(1);
    for (const g of animated) {
      const drawn = inside(svg, 'relationship', g['data-id']!);
      const line = elements(drawn, 'path')[0]!;
      expect(line['stroke-linecap']).toBe('round');
      expect(line['stroke-dasharray']).toBe('9,5');
      expect(elements(drawn, 'animate')).toEqual([
        {
          tag: 'animate',
          attributeName: 'stroke-dashoffset',
          from: '900',
          to: '0',
          dur: g.class!.includes('edge-animation-slow') ? '50' : '20',
          repeatCount: 'indefinite',
        },
      ]);
    }
    expect(elements(svg, 'animate')).toHaveLength(animated.length);
  });
});

describe('accessible names (v12 usecaseRenderer.spec.ts)', () => {
  it('names actors, use cases, boundaries, notes and JSON tables as v12 did', async () => {
    const { svg } = await render('pr-check/small-representative-visual-snapshot');
    const name = (id: string) => elements(svg, 'g').find((e) => e['data-id'] === id)!['aria-label'];
    expect(name('Normal')).toBe('actor Normal User, stereotype Human');
    expect(name('Hollow')).toBe('business hollow actor Hollow');
    expect(name('Checkout')).toBe('business use case Checkout, stereotype Core');
    // A Markdown label by its words, a line at a time (v12 `markdownToLines`).
    expect(name('Login')).toBe('use case Sign in\nsecurely, stereotype Main');
    expect(name('Authentication_System')).toBe('package system boundary Authentication System');
    expect(name('note-0')).toBe('Note for Sign in\nsecurely: Requires an active session');
    expect(name('Payload')).toBe(
      'Payload: 2: two; 1: one; colors: Red; colors: Green; address.city: Oslo; empty: {}'
    );
    for (const g of elements(svg, 'g').filter(
      (e) => e['data-ast'] !== undefined && !hasClass(e, 'relationship')
    ))
      expect(g.role).toBe('img');
  });

  it('names a label by the words it draws: no tags, markers or written breaks (D735)', async () => {
    const { svg } = await render('pr-check/label-syntax');
    const name = (id: string) => elements(svg, 'g').find((e) => e['data-id'] === id)!['aria-label'];
    expect(name('A5')).toBe('actor actor bold ital\nnext H2O');
    expect(name('U5')).toBe('use case usecase bold ital\nnext H2O');
    expect(name('B5')).toBe('rect system boundary boundary bold ital\nnext H2O');
    expect(name('note-4')).toBe('Note for usecase bold ital\nnext H2O: note bold ital\nnext H2O');
    expect(name('note-5')).toBe('Note for usecase one\ntwo: note one\ntwo');
    expect(name('U2')).toBe('use case usecase bold ital');
    expect(name('U1')).toBe('use case usecase **bold** _ital_');
  });
});

describe('colours (D474, theming.md)', () => {
  it('paints each kind in its role colours in a theme without a palette, unstamped', async () => {
    const { svg } = await render('pr-check/themed-elements-default-theme');
    const glyph = byClass(svg, 'usecase-actor-stick', 'path')[0]!;
    expect(glyph).toMatchObject({
      fill: 'var(--_uab)',
      stroke: 'var(--_uar)',
      'stroke-width': '2',
    });
    const oval = elements(inside(svg, 'node', 'Login'), 'ellipse')[0]!;
    expect(oval).toMatchObject({ fill: 'var(--_ucb)', stroke: 'var(--_ucr)', 'stroke-width': '2' });
    expect(byClass(svg, 'boundary-body', 'rect')[0]).toMatchObject({
      fill: 'var(--_ubb)',
      stroke: 'var(--_ubr)',
      'stroke-width': '1',
    });
    expect(svg).not.toContain('data-color-id');
    // The aliases resolve through the table's rules (D474: no palette, the fallbacks).
    expect(svg).toMatch(/--_uab:var\(--mermaid-usecaseActorBkg,var\(--_ab\)\)/);
  });

  it('stamps every actor, use case and boundary under role, but paints only boundaries from the palette', async () => {
    const { svg } = await render('nightly-check/themed-elements-redux-color-theme');
    const stamps = elements(svg, 'g')
      .filter((e) => e['data-color-id'])
      .map((e) => [e['data-id'], e['data-color-id']]);
    expect(stamps).toEqual([
      ['Authentication_System', 'color-0'],
      ['Normal', 'color-0'],
      ['Hollow', 'color-1'],
      ['Business', 'color-2'],
      ['Login', 'color-3'],
      ['Reset', 'color-4'],
      ['Checkout', 'color-5'],
    ]);
    // The boundary takes slot 0's literal border and fill (v12 `styles.ts:110-124`).
    expect(byClass(svg, 'boundary-body', 'rect')[0]).toMatchObject({
      stroke: '#e879f9',
      fill: '#fdf4ff',
    });
    // Actors and use cases keep their role colours.
    expect(byClass(svg, 'usecase-actor-stick', 'path')[0]).toMatchObject({
      fill: 'var(--_uab)',
      stroke: 'var(--_uar)',
    });
  });

  it('paints actors then use cases from one counter under colorScheme: rotate, notes and tables from none', async () => {
    const { svg } = await render('pr-check/palette-rotation-redux-color-theme');
    const oval = (id: string) => elements(inside(svg, 'node', id), 'ellipse')[0]!;
    const stick = byClass(inside(svg, 'node', 'Normal'), 'usecase-actor-stick', 'path')[0]!;
    expect(stick).toMatchObject({ stroke: '#e879f9', fill: '#fdf4ff' });
    expect(group(svg, 'node', 'Login')['data-color-id']).toBe('color-3');
    expect(oval('Login')).toMatchObject({ stroke: '#22d3ee', fill: '#ecfeff' });
    expect(group(svg, 'node', 'note-0')['data-color-id']).toBeUndefined();
    expect(group(svg, 'node', 'Payload')['data-color-id']).toBeUndefined();
    // A hollow actor stays hollow.
    expect(byClass(svg, 'usecase-actor-hollow-body', 'path')[0]).toMatchObject({ fill: 'none' });
  });

  it('paints by role, with one USECASE_CONFIG_IGNORED, for a colorScheme it does not know', async () => {
    const { svg, warnings } = await render('nightly-check/themed-elements-redux-color-theme', {
      config: { usecase: { colorScheme: 'sideways' } },
    });
    expect(warnings.filter((w) => w.code === 'USECASE_CONFIG_IGNORED')).toEqual([
      expect.objectContaining({ path: 'usecase.colorScheme' }),
    ]);
    expect(byClass(svg, 'usecase-actor-stick', 'path')[0]!.fill).toBe('var(--_uab)');
  });

  it('colours outlines only where bkgColorArray is empty (redux-dark-color)', async () => {
    const { svg } = await render('pr-check/palette-rotation-redux-dark-color-theme');
    const oval = elements(inside(svg, 'node', 'Login'), 'ellipse')[0]!;
    expect(oval.stroke).toMatch(/^#/);
    expect(oval.fill).toBe('var(--_ucb)');
    expect(byClass(svg, 'boundary-body', 'rect')[0]!.fill).toBe('var(--_ubb)');
  });

  it('lets an author’s style win over the palette and the role colours', async () => {
    const { svg } = await render('pr-check/small-representative-visual-snapshot');
    expect(byClass(svg, 'boundary-body', 'rect')[0]).toMatchObject({
      fill: '#fdf6e3',
      stroke: '#6c71c4',
      'stroke-width': '3px',
    });
    expect(elements(inside(svg, 'node', 'Checkout'), 'ellipse')[0]).toMatchObject({
      stroke: '#dc322f',
      'stroke-width': '4px',
    });
    expect(byClass(inside(svg, 'node', 'Checkout'), 'usecase-business-marker')[0]!.stroke).toBe(
      '#dc322f'
    );
    expect(byClass(inside(svg, 'node', 'Payload'), 'usecase-json-cell', 'rect')[0]).toMatchObject({
      fill: '#eef7ff',
      stroke: '#123456',
    });
  });
});

describe('business marks (v12 shapes)', () => {
  it('draws an actor’s mark at the glyph’s width, a use case’s at 1 unless styled', async () => {
    const { svg } = await render('pr-check/palette-rotation-redux-color-theme');
    const mark = (id: string) => byClass(inside(svg, 'node', id), 'usecase-business-marker')[0]!;
    // v12: the actor's mark inherits the glyph's 2px; the oval's has no width of its own.
    expect(mark('Business')['stroke-width']).toBe('2');
    expect(mark('Checkout')['stroke-width']).toBe('1');
    const styled = await render('pr-check/small-representative-visual-snapshot');
    expect(
      byClass(inside(styled.svg, 'node', 'Checkout'), 'usecase-business-marker')[0]
    ).toMatchObject({
      'stroke-width': '4px',
    });
  });
});

describe('icon actors (D293)', () => {
  const glyph: SvgFragment = { tag: 'path', attrs: { class: 'glyph' } };

  it('draws the extension’s glyph in the frame, painted in the actor’s text colour', async () => {
    const asked: [string, number, unknown][] = [];
    const icon = ((name: string, size: number, options?: unknown) => {
      asked.push([name, size, options]);
      return glyph;
    }) as RenderUsecaseOptions['icon'];
    const { svg, warnings } = await render('nightly-check/03-actor-variants', { ...plain, icon });
    expect(asked.map(([n, s]) => [n, s])).toEqual([
      ['fa:user', 42],
      ['not-registered:user', 42],
    ]);
    expect(asked[0]![2]).toMatchObject({
      paint: 'var(--_pt)',
      pending: true,
      fallbackPrefix: 'fa',
    });
    expect(byClass(svg, 'usecase-actor-icon-symbol', 'g')).toHaveLength(2);
    expect(byClass(svg, 'usecase-actor-icon-frame', 'rect')).toHaveLength(2);
    expect(warnings.map((w) => w.code)).not.toContain('ICON_NOT_RENDERED');
  });

  it('draws the frame alone, with one ICON_NOT_RENDERED, without an icons extension', async () => {
    const { svg, warnings } = await render('nightly-check/03-actor-variants');
    expect(byClass(svg, 'usecase-actor-icon-symbol', 'g')).toHaveLength(0);
    expect(byClass(svg, 'usecase-actor-icon-frame', 'rect')).toHaveLength(2);
    expect(warnings.filter((w) => w.code === 'ICON_NOT_RENDERED')).toHaveLength(1);
  });
});

describe('hand-drawn (D302, spec #517)', () => {
  interface Call {
    role: OutlineRole;
    tag: OutlineTag;
    cls?: string;
  }
  const record = (calls: Call[], draw = false): OutlineDraw =>
    ((role: OutlineRole, tag: OutlineTag, attrs: Attrs, sink) => {
      calls.push({ role, tag, cls: attrs.class });
      if (!draw) return false;
      sink.open('g', { class: `sketch-${role}` });
      sink.leaf('path', { d: sink.path().moveTo(0, 0).lineTo(1, 1).done() });
      sink.close();
      return true;
    }) as OutlineDraw;

  it('sends every shape, frame and line through w.outline with its role', async () => {
    const calls: Call[] = [];
    const { model } = await render('pr-check/complete-hand-drawn-rendering-contract', {
      outline: record(calls),
    });
    const roles = new Set(calls.map((c) => `${c.role} ${c.tag}`));
    expect([...roles].sort()).toEqual([
      'edge path',
      'group rect',
      // Edge-label tags sketch their border (D630).
      'label rect',
      'node circle',
      'node ellipse',
      'node path',
      'node rect',
      'part rect',
    ]);
    expect(calls.filter((c) => c.role === 'edge')).toHaveLength(
      model.relationships.length + model.notes.length
    );
    expect(calls.some((c) => (c.cls ?? '').includes('marker'))).toBe(false);
  });

  it('draws byte-identically with a drawer that declines, and leaves markers and text plain', async () => {
    const path = 'pr-check/complete-hand-drawn-rendering-contract';
    const bare = await render(path);
    const declined = await render(path, { outline: record([]) });
    expect(declined.svg).toBe(bare.svg);
    const drawn = await render(path, { outline: record([], true) });
    expect(drawn.svg).toContain('class="sketch-node"');
    expect(drawn.svg).toContain('class="sketch-group"');
    expect(drawn.svg).toContain('class="sketch-edge"');
    expect(byClass(drawn.svg, 'marker').length).toBe(byClass(bare.svg, 'marker').length);
    expect(texts(drawn.svg)).toEqual(texts(bare.svg));
    expect(drawn.warnings.map((w) => w.code)).toContain('LOOK_REMOVED');
  });
});

describe('edge animation (#918)', () => {
  it('no longer warns that the animation is ignored', async () => {
    const { warnings } = await render('nightly-check/15-animation-variants');
    expect(warnings.filter((w) => w.code === 'EDGE_ANIMATION_IGNORED')).toEqual([]);
  });
});
