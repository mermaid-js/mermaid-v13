/**
 * Embedded diagrams (ADR-15, #664): `mermaid <id>["Title"] { … }` blocks in a flowchart,
 * checked at the public API seam: text in, SVG and errors out.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError } from './index.ts';

const LOGIN = [
  'flowchart LR',
  '  A --> login',
  '  mermaid login["Login flow"] {',
  '    sequenceDiagram',
  '      U->>S: credentials',
  '      S-->>U: token',
  '  }',
  '  login --> B',
].join('\n');

/** Start tags of every `<svg>` in the output, the outer root first. */
function roots(svg: string): string[] {
  return [...svg.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

async function rejection(p: Promise<unknown>): Promise<MermaidError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
  throw new Error('expected a rejection');
}

describe('a mermaid block in a flowchart', () => {
  it('renders the inner diagram as a nested <svg> inside the host', async () => {
    const m = createMermaid();
    const { svg } = await m.render('host', LOGIN);
    const all = roots(svg);
    expect(all).toHaveLength(2);
    expect(all[1]).toContain('mermaid-sequence');
    expect(svg).toContain('credentials');
    assertInert(svg);
  });

  it('renders sequence, class and mind map blocks through render and renderSync alike', async () => {
    const text = [
      'flowchart TB',
      '  mermaid seq["Talk"] {',
      '    sequenceDiagram',
      '      A->>B: hi',
      '  }',
      '  mermaid cls["Model"] {',
      '    classDiagram',
      '      class User {',
      '        +name: string',
      '      }',
      '  }',
      '  mermaid map {',
      '    mindmap',
      '      root',
      '        leaf',
      '  }',
      '  seq --> cls --> map',
    ].join('\n');
    const viaRender = await createMermaid().render('same', text);
    const m = createMermaid();
    await m.prepare(text);
    const viaSync = m.renderSync(text, { id: 'same' });
    expect(viaSync.svg).toBe(viaRender.svg);
    const kinds = roots(viaRender.svg).map((t) => attr(t, 'class'));
    expect(kinds).toEqual([
      'mermaid mermaid-flowchart',
      'mermaid mermaid-sequence',
      'mermaid mermaid-class',
      'mermaid mermaid-mindmap',
    ]);
    assertInert(viaRender.svg);
  });

  it('sizes the box to the inner diagram plus its padding and title strip', async () => {
    const { svg } = await createMermaid().render('host', LOGIN);
    const inner = roots(svg)[1]!;
    const box = /<g class="node embed"[^>]*><rect ([^>]*)\/>/.exec(svg)![1]!;
    const num = (s: string, n: string) => Number(attr(` ${s}`, n));
    // 8 px around the inner diagram; the title strip on top is the title's line plus 6 px
    // above and below it.
    expect(num(box, 'width')).toBe(Number(attr(inner, 'width')) + 16);
    const strip = num(box, 'height') - Number(attr(inner, 'height')) - 16;
    expect(strip).toBeGreaterThan(12);
    expect(strip).toBeLessThan(40);
    expect(attr(inner, 'width')).not.toBe('100%');
  });
});

describe('block isolation', () => {
  const twins = [
    'flowchart LR',
    '  mermaid one {',
    '    sequenceDiagram',
    '      accTitle: Same',
    '      A->>B: hi',
    '  }',
    '  mermaid two {',
    '    sequenceDiagram',
    '      accTitle: Same',
    '      A->>B: hi',
    '  }',
    '  one --> two',
  ].join('\n');

  it('gives two identical blocks different id prefixes', async () => {
    const { svg } = await createMermaid().render('host', twins);
    const ids = [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['host-one-title', 'host-two-title']);
  });

  it('declares each root its own theme aliases, so none leak either way', async () => {
    const { svg } = await createMermaid().render('host', twins);
    const [host, inner] = roots(svg).map((t) => attr(t, 'style') ?? '');
    // The sequence aliases are on the block's root only; the host declares only its own.
    expect(inner).toContain('--_ab:var(--mermaid-actorBkg');
    expect(host).not.toContain('--_ab:');
  });

  it('inherits the host theme, and keeps a theme: auto sheet inside its own root', async () => {
    const dark = await createMermaid().render('host', `---\nconfig:\n  theme: dark\n---\n${twins}`);
    const light = await createMermaid().render('host', twins);
    expect(roots(dark.svg)[1]).not.toBe(roots(light.svg)[1]);
    const m = createMermaid();
    m.initialize({ theme: 'auto' });
    const { svg } = await m.render('host', twins);
    expect(svg.match(/<style>/g)?.length).toBe(3);
    assertInert(svg, { themeStyle: true });
  });
});

describe('block syntax', () => {
  it('matches braces by line, so inner state composites, class bodies and ER entities parse', async () => {
    const text = [
      'flowchart LR',
      '  mermaid st["States"] {',
      '    stateDiagram-v2',
      '      state Busy {',
      '        [*] --> Working',
      '        state Deep {',
      '          a --> b',
      '        }',
      '      }',
      '  }',
      '  mermaid cls {',
      '    classDiagram',
      '      class Shape {',
      '        +area() float',
      '      }',
      '  }',
      '  mermaid er {',
      '    erDiagram',
      '      %% a comment ending in {',
      '      USER {',
      '        string name "a { quoted"',
      '      }',
      '  }',
      '  st --> cls --> er',
    ].join('\n');
    const { svg } = await createMermaid().render('host', text);
    expect(roots(svg).map((t) => attr(t, 'class')?.split(' ')[1])).toEqual([
      'mermaid-flowchart',
      'mermaid-state',
      'mermaid-class',
      'mermaid-er',
    ]);
    expect(svg).toContain('Deep');
    expect(svg).toContain('area()');
  });

  it('keeps `mermaid`, `mermaid["T"]` and `mermaid --> B` ordinary nodes', async () => {
    for (const line of ['mermaid', 'mermaid["T"]', 'mermaid --> B', 'A --> mermaid']) {
      const { svg } = await createMermaid().render('host', `flowchart LR\n  ${line}\n`);
      expect(roots(svg), line).toHaveLength(1);
      expect(svg).toContain('data-id="mermaid"');
    }
  });

  it('rejects a block whose body does not start with a diagram type, at its line', async () => {
    const text = ['flowchart LR', '  mermaid x {', '', '    A --> B', '  }'].join('\n');
    const e = await rejection(createMermaid().render('host', text));
    expect(e.code).toBe('SYNTAX');
    expect(e.line).toBe(4);
    expect(e.column).toBe(5);
    expect(e.message).toContain('must start with a diagram type');
    expect((await rejection(createMermaid().parse(text))).line).toBe(4);
  });

  it('reports a syntax error inside a block at its line in the whole text', async () => {
    const text = [
      'flowchart LR',
      '  mermaid x {',
      '    sequenceDiagram',
      '      A->>: oops',
      '  }',
    ].join('\n');
    const e = await rejection(createMermaid().render('host', text));
    expect(e.line).toBe(4);
  });

  it('reports an unclosed block at its opening line', async () => {
    const text = ['flowchart LR', '  mermaid x {', '    sequenceDiagram', '      A->>B: hi'].join(
      '\n'
    );
    const e = await rejection(createMermaid().render('host', text));
    expect(e.line).toBe(2);
    expect(e.message).toContain('Unclosed block');
  });
});

describe('a block as a node of the host', () => {
  /** The node `<g>` of `id`: its translate and its first rect. */
  function nodeBox(svg: string, id: string) {
    const m = new RegExp(
      `<g class="node[^"]*" data-id="${id}"[^>]*transform="translate\\(([-\\d.]+),([-\\d.]+)\\)"[^>]*><rect x="([-\\d.]+)" y="[-\\d.]+" width="([\\d.]+)"`
    ).exec(svg);
    if (!m) throw new Error(`no node ${id}`);
    const cx = Number(m[1]);
    return { left: cx + Number(m[3]), right: cx + Number(m[3]) + Number(m[4]) };
  }

  /** Where the arrowhead of the edge `id` points. */
  function tip(svg: string, id: string): number {
    const m = new RegExp(`data-id="${id}"[^>]*>.*?<path class="marker" d="M([\\d.]+),`).exec(svg);
    if (!m) throw new Error(`no edge ${id}`);
    return Number(m[1]);
  }

  it('routes edges to and from the box border, as for any node', async () => {
    const { svg } = await createMermaid().render('host', LOGIN);
    const login = nodeBox(svg, 'login');
    const b = nodeBox(svg, 'B');
    // An arrowhead stops the same distance short of the box as of a plain node.
    const gapIn = login.left - tip(svg, 'L_A_login_0');
    const gapOut = b.left - tip(svg, 'L_login_B_0');
    expect(gapIn).toBeCloseTo(gapOut, 5);
    expect(gapIn).toBeGreaterThanOrEqual(0);
    expect(gapIn).toBeLessThan(10);
  });

  it('sits in a subgraph and takes class, classDef and style', async () => {
    const text = [
      'flowchart TB',
      '  subgraph Backend',
      '    mermaid model["Data model"] {',
      '      erDiagram',
      '        USER ||--o{ ORDER : places',
      '    }',
      '  end',
      '  classDef dashed stroke-dasharray:4',
      '  class model dashed',
      '  style model stroke:#ff0000',
      '  client --> model',
    ].join('\n');
    const { svg } = await createMermaid().render('host', text);
    const cluster = /data-id="Backend"[^>]*><rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(
      svg
    )!;
    const box = nodeBox(svg, 'model');
    expect(box.left).toBeGreaterThan(Number(cluster[1]));
    expect(box.right).toBeLessThan(Number(cluster[1]) + Number(cluster[2]));
    const g =
      /<g class="node embed dashed" data-id="model"[^>]*role="img" aria-label="Data model"[^>]*><rect [^>]*>/.exec(
        svg
      );
    expect(g?.[0]).toContain('stroke="#ff0000"');
    expect(g?.[0]).toContain('stroke-dasharray="4"');
    expect(g?.[0]).toContain('fill="none"');
    assertInert(svg);
  });
});

describe('links and tooltips inside a block (#669)', () => {
  /** A host whose block holds a flowchart with `click` lines for its node `X`. */
  const linked = (...clicks: string[]) =>
    [
      'flowchart LR',
      '  A --> blk',
      '  mermaid blk["Inner"] {',
      '    flowchart LR',
      '      X --> Y',
      ...clicks.map((c) => `      ${c}`),
      '  }',
    ].join('\n');

  /** The markup of the nested root (the block's own `<svg>`). */
  function nested(svg: string): string {
    const start = svg.indexOf('<svg', 1);
    const end = svg.indexOf('</svg>', start);
    return svg.slice(start, end);
  }

  it('draws a link and a tooltip on a node inside the block, as a stand-alone diagram does', async () => {
    const text = linked('click X href "https://example.com/docs" "Read the docs" _blank');
    const { svg } = await createMermaid().render('host', text);
    const inner = nested(svg);
    expect(inner).toMatch(/<a [^>]*href="https:\/\/example\.com\/docs"[^>]*target="_blank"/);
    expect(inner).toMatch(/<g class="node[^"]*" data-id="X"[^>]*><title>Read the docs<\/title>/);
    assertInert(svg);
  });

  it("drops a block's javascript: link under the host's strict security level", async () => {
    const text = linked('click X href "javascript:alert(1)" "tip"');
    const m = createMermaid();
    m.initialize({ securityLevel: 'strict' });
    const { svg } = await m.render('host', text);
    expect(svg).not.toContain('javascript:');
    expect(nested(svg)).toContain('<title>tip</title>');
  });

  it("does not let the block's front matter loosen the host's security level", async () => {
    const text = [
      'flowchart LR',
      '  mermaid blk {',
      '    ---',
      '    config:',
      '      securityLevel: loose',
      '    ---',
      '    flowchart LR',
      '      X --> Y',
      '      click X href "javascript:alert(1)"',
      '  }',
    ].join('\n');
    const { svg, warnings } = await createMermaid().render('host', text);
    expect(svg).not.toContain('javascript:');
    expect(warnings.map((w) => w.code)).toContain('CONFIG_SECURE_KEY');
  });
});

describe('the flowchart block fixtures (e2e/diagrams/flowchart/baseline/embedded)', () => {
  const dir = new URL('../../../e2e/diagrams/flowchart/baseline/embedded/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.mmd'));

  it('has fixtures', () => expect(files.length).toBeGreaterThanOrEqual(5));

  it.each(files)('%s renders every block as a nested <svg>', async (file) => {
    const text = readFileSync(new URL(file, dir), 'utf8');
    const blocks = text.match(/^\s*mermaid \S+.*\{\s*$/gm)?.length ?? 0;
    const { svg } = await createMermaid().render('fixture', text);
    expect(blocks).toBeGreaterThan(0);
    expect(roots(svg)).toHaveLength(1 + blocks);
    assertInert(svg);
  });
});
