/**
 * Embedded diagrams (ADR-15, #667): `mermaid <id>["Title"] { … }` blocks in a state diagram,
 * checked at the public API seam: text in, SVG and errors out.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError } from './index.ts';

const LOGIN = [
  'stateDiagram-v2',
  '  [*] --> Idle',
  '  Idle --> login',
  '  mermaid login["Login flow"] {',
  '    sequenceDiagram',
  '      U->>S: credentials',
  '      S-->>U: token',
  '  }',
  '  login --> Done',
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

describe('a mermaid block in a state diagram', () => {
  it('renders the inner diagram as a nested <svg> inside the host', async () => {
    const { svg } = await createMermaid().render('host', LOGIN);
    const all = roots(svg);
    expect(all).toHaveLength(2);
    expect(attr(all[0]!, 'class')).toContain('mermaid-state');
    expect(attr(all[1]!, 'class')).toBe('mermaid mermaid-sequence');
    expect(svg).toContain('credentials');
    assertInert(svg);
  });
});

/** The node `<g>` of `id`: its centre and its first rect, in the host's coordinates. */
function nodeBox(svg: string, id: string) {
  const m = new RegExp(
    `<g class="node[^"]*" data-id="${id}"[^>]*transform="translate\\(([-\\d.]+),([-\\d.]+)\\)"[^>]*><rect x="([-\\d.]+)" y="([-\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`
  ).exec(svg);
  if (!m) throw new Error(`no node ${id}`);
  const [cx, cy, x, y, w, h] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return { left: cx + x, top: cy + y, right: cx + x + w, bottom: cy + y + h, width: w, height: h };
}

/** Where the arrowhead of the transition `ast` points (its y, for a top-to-bottom diagram). */
function tipY(svg: string, ast: string): number {
  const m = new RegExp(`data-ast="${ast}"[^>]*>.*?<path class="marker" d="M[\\d.]+,([\\d.]+)`).exec(
    svg
  );
  if (!m) throw new Error(`no transition ${ast}`);
  return Number(m[1]);
}

describe('a block as a state of the host', () => {
  it('ends transitions at the box border, as for any state', async () => {
    const { svg } = await createMermaid().render('host', LOGIN);
    const login = nodeBox(svg, 'login');
    const done = nodeBox(svg, 'Done');
    const gapIn = login.top - tipY(svg, 'e:Idle&gt;login');
    const gapOut = done.top - tipY(svg, 'e:login&gt;Done');
    expect(gapIn).toBeCloseTo(gapOut, 5);
    expect(gapIn).toBeGreaterThanOrEqual(0);
    expect(gapIn).toBeLessThan(10);
  });

  it('sizes the box to the inner diagram plus its padding and title strip', async () => {
    const { svg } = await createMermaid().render('host', LOGIN);
    const inner = roots(svg)[1]!;
    const box = nodeBox(svg, 'login');
    // 8 px around the inner diagram; the title strip on top is the title's line plus 6 px
    // above and below it.
    expect(box.width).toBe(Number(attr(inner, 'width')) + 16);
    const strip = box.height - Number(attr(inner, 'height')) - 16;
    expect(strip).toBeGreaterThan(12);
    expect(strip).toBeLessThan(40);
    expect(svg).toMatch(
      /<g class="node embed" data-id="login"[^>]*role="img" aria-label="Login flow"/
    );
  });

  it('draws an untitled block without a title strip, named by its id', async () => {
    const text = ['stateDiagram-v2', '  mermaid chart {', '    pie', '      "a": 1', '  }'].join(
      '\n'
    );
    const { svg } = await createMermaid().render('host', text);
    const box = nodeBox(svg, 'chart');
    expect(box.height).toBe(Number(attr(roots(svg)[1]!, 'height')) + 16);
    expect(svg).toMatch(/data-id="chart"[^>]*aria-label="chart"/);
  });

  it('sits in a composite state, with transitions inside it', async () => {
    const text = [
      'stateDiagram-v2',
      '  state Checkout {',
      '    [*] --> cart',
      '    cart --> pay',
      '    mermaid pay["Payment"] {',
      '      sequenceDiagram',
      '        C->>P: charge',
      '    }',
      '    pay --> [*]',
      '  }',
      '  [*] --> Checkout',
    ].join('\n');
    const { svg } = await createMermaid().render('host', text);
    expect(roots(svg)).toHaveLength(2);
    const group =
      /data-id="Checkout"[^>]*><rect class="outer" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
        svg
      )!;
    const [gx, gy, gw, gh] = group.slice(1).map(Number) as [number, number, number, number];
    const box = nodeBox(svg, 'pay');
    expect(box.left).toBeGreaterThan(gx);
    expect(box.right).toBeLessThan(gx + gw);
    expect(box.top).toBeGreaterThan(gy);
    expect(box.bottom).toBeLessThan(gy + gh);
    assertInert(svg);
  });

  it('takes class, classDef and style on its frame', async () => {
    const text = [
      'stateDiagram-v2',
      '  mermaid model["Data model"] {',
      '    erDiagram',
      '      USER ||--o{ ORDER : places',
      '  }',
      '  classDef dashed stroke-dasharray:4',
      '  class model dashed',
      '  style model stroke:#ff0000',
      '  [*] --> model',
    ].join('\n');
    const { svg } = await createMermaid().render('host', text);
    const g = /<g class="node embed dashed" data-id="model"[^>]*><rect [^>]*>/.exec(svg);
    expect(g?.[0]).toContain('stroke="#ff0000"');
    expect(g?.[0]).toContain('stroke-dasharray="4"');
    expect(g?.[0]).toContain('fill="none"');
    assertInert(svg);
  });
});

describe('block syntax in a state diagram', () => {
  it('keeps `mermaid` an ordinary state id', async () => {
    for (const line of ['mermaid', 'mermaid --> B', 'A --> mermaid', 'mermaid : waiting']) {
      const { svg } = await createMermaid().render('host', `stateDiagram-v2\n  ${line}\n`);
      expect(roots(svg), line).toHaveLength(1);
      expect(svg, line).toContain('data-id="mermaid"');
    }
    // `mermaid sub["T"]` without a brace is two states, as in mermaid@12.
    const { svg } = await createMermaid().render('host', 'stateDiagram-v2\n  mermaid sub["T"]\n');
    expect(roots(svg)).toHaveLength(1);
    expect(svg).toContain('data-id="mermaid"');
  });

  it('matches braces by line, so a state block with composites parses', async () => {
    const text = [
      'stateDiagram-v2',
      '  mermaid inner["Inner"] {',
      '    stateDiagram-v2',
      '      state Busy {',
      '        %% a comment with a { does not count',
      '        [*] --> Working',
      '      }',
      '  }',
      '  [*] --> inner',
    ].join('\n');
    const { svg } = await createMermaid().render('host', text);
    expect(roots(svg).map((t) => attr(t, 'class')?.split(' ')[1])).toEqual([
      'mermaid-state',
      'mermaid-state',
    ]);
    expect(svg).toContain('Working');
    assertInert(svg);
  });

  it('reports a syntax error inside a block at its line in the whole text', async () => {
    const text = [
      'stateDiagram-v2',
      '  [*] --> x',
      '  mermaid x {',
      '    sequenceDiagram',
      '      A->>: oops',
      '  }',
    ].join('\n');
    const e = await rejection(createMermaid().render('host', text));
    expect(e.line).toBe(5);
  });

  it('reports an unclosed block at its opening line', async () => {
    const text = [
      'stateDiagram-v2',
      '  mermaid x {',
      '    sequenceDiagram',
      '      A->>B: hi',
    ].join('\n');
    const e = await rejection(createMermaid().render('host', text));
    expect(e.line).toBe(2);
    expect(e.message).toContain('Unclosed block');
  });
});

describe('block ids in a state diagram', () => {
  const block = (id: string) => [`  mermaid ${id} {`, '    pie', '      "a": 1', '  }'];

  it('lets transitions, notes and repeats refer to the block by id', async () => {
    const text = [
      'stateDiagram-v2',
      '  [*] --> login',
      ...block('login'),
      '  login --> login',
      '  note right of login : hidden detail',
    ].join('\n');
    const { svg } = await createMermaid().render('host', text);
    expect(roots(svg)).toHaveLength(2);
    expect(svg.match(/data-id="login"/g)).toHaveLength(1);
  });

  it.each([
    ['a second block', ['stateDiagram-v2', ...block('login'), ...block('login')], 6],
    [
      'a composite state',
      ['stateDiagram-v2', '  state login {', '    A', '  }', ...block('login')],
      5,
    ],
    ['a described state', ['stateDiagram-v2', '  login : waiting', ...block('login')], 3],
    ['a description after it', ['stateDiagram-v2', ...block('login'), '  login : waiting'], 6],
  ])('rejects a block id that is also %s', async (_, lines, line) => {
    const e = await rejection(createMermaid().render('host', lines.join('\n')));
    expect(e.message).toContain('`login`');
    expect(e.line).toBe(line);
  });
});

describe('the state block fixtures (e2e/diagrams/state-diagram-v2/baseline/embedded)', () => {
  const dir = new URL('../../../e2e/diagrams/state-diagram-v2/baseline/embedded/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.mmd'));

  it('has fixtures', () => expect(files.length).toBeGreaterThanOrEqual(3));

  it.each(files)('%s renders every block as a nested <svg>', async (file) => {
    const text = readFileSync(new URL(file, dir), 'utf8');
    const blocks = text.match(/^\s*mermaid \S+.*\{\s*$/gm)?.length ?? 0;
    const { svg } = await createMermaid().render('fixture', text);
    expect(blocks).toBeGreaterThan(0);
    expect(roots(svg)).toHaveLength(1 + blocks);
    assertInert(svg);
  });
});

describe('limits across a state host and its blocks', () => {
  // Two transitions in the host, two in a state block inside it.
  const text = [
    'stateDiagram-v2',
    '  [*] --> inner',
    '  mermaid inner {',
    '    stateDiagram-v2',
    '      [*] --> A',
    '      A --> [*]',
    '  }',
    '  inner --> [*]',
  ].join('\n');

  it('counts the host transitions and the block edges against maxEdges', async () => {
    const m = createMermaid();
    m.initialize({ maxEdges: 4 });
    expect(roots((await m.render('host', text)).svg)).toHaveLength(2);
    const over = createMermaid();
    over.initialize({ maxEdges: 3 });
    const e = await rejection(over.render('host', text));
    expect(e.code).toBe('LIMIT');
  });
});
