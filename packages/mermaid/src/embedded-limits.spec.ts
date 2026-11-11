/**
 * Embedded diagrams (ADR-15, #666): nesting, errors, config and limits of `mermaid` blocks,
 * checked at the public API seam: text in, SVG, errors and warnings out.
 */
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

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

/** `levels` flowchart blocks, one inside the next, the deepest holding a sequence diagram. */
function nested(levels: number): string {
  const lines: string[] = ['flowchart LR'];
  const pad = (n: number) => '  '.repeat(n);
  for (let i = 1; i <= levels; i++) {
    lines.push(`${pad(2 * i - 1)}mermaid b${i}["Level ${i}"] {`);
    lines.push(i < levels ? `${pad(2 * i)}flowchart LR` : `${pad(2 * i)}sequenceDiagram`);
  }
  lines.push(`${pad(2 * levels + 1)}A->>B: deepest`);
  for (let i = levels; i >= 1; i--) lines.push(`${pad(2 * i - 1)}}`);
  return lines.join('\n');
}

describe('nested blocks', () => {
  it('renders a flowchart block holding a flowchart block holding a sequence block', async () => {
    const { svg } = await createMermaid().render('host', nested(2));
    expect(roots(svg).map((t) => attr(t, 'class'))).toEqual([
      'mermaid mermaid-flowchart',
      'mermaid mermaid-flowchart',
      'mermaid mermaid-sequence',
    ]);
    expect(svg).toContain('deepest');
    assertInert(svg);
  });
});

describe('the nesting limit', () => {
  it('renders blocks nested four deep', async () => {
    const { svg } = await createMermaid().render('host', nested(4));
    expect(roots(svg)).toHaveLength(5);
    expect(svg).toContain('deepest');
  });

  it('rejects a fifth level at its opening line, in render and parse', async () => {
    const text = nested(5);
    const e = await rejection(createMermaid().render('host', text));
    expect(e.code).toBe('SYNTAX');
    // Line 10 opens b5: `mermaid b5["Level 5"] {`, indented 18 spaces.
    expect(e.line).toBe(10);
    expect(e.column).toBe(19);
    expect(e.message).toContain('nested more than 4');
    expect((await rejection(createMermaid().parse(text))).line).toBe(10);
  });
});

describe('limits count the whole text', () => {
  /** A host with two edges, holding a block with two edges holding a block with two. */
  const text = [
    'flowchart LR',
    '  A --> outer',
    '  outer --> B',
    '  mermaid outer {',
    '    flowchart LR',
    '      C --> D --> inner',
    '      mermaid inner {',
    '        flowchart LR',
    '          E --> F --> G',
    '      }',
    '  }',
  ].join('\n');

  it('renders within maxEdges, all blocks counted', async () => {
    const m = createMermaid();
    m.initialize({ maxEdges: 6 });
    expect(roots((await m.render('host', text)).svg)).toHaveLength(3);
  });

  it('rejects edges over maxEdges across blocks, at the block that passes it', async () => {
    const m = createMermaid();
    m.initialize({ maxEdges: 5 });
    const e = await rejection(m.render('host', text));
    expect(e.code).toBe('LIMIT');
    expect(e.limit).toBe('maxEdges');
    expect(e.line).toBe(7);
    expect(e.message).toMatch(/asks for 6 edges, but the limit is 5/);
    const p = createMermaid();
    p.initialize({ maxEdges: 5 });
    expect((await rejection(p.parse(text))).code).toBe('LIMIT');
  });

  it('counts class relationships and ER relationships in blocks as edges', async () => {
    const blocks = [
      'flowchart LR',
      '  cls --> er',
      '  mermaid cls {',
      '    classDiagram',
      '      A <|-- B',
      '      B --> C',
      '  }',
      '  mermaid er {',
      '    erDiagram',
      '      USER ||--o{ ORDER : places',
      '  }',
    ].join('\n');
    const m = createMermaid();
    m.initialize({ maxEdges: 3 });
    expect((await rejection(m.render('host', blocks))).line).toBe(8);
    m.initialize({ maxEdges: 4 });
    expect(roots((await m.render('host', blocks)).svg)).toHaveLength(3);
  });

  it('applies maxTextSize to the whole text, block bodies included', async () => {
    const m = createMermaid();
    m.initialize({ maxTextSize: text.length - 1 });
    expect((await rejection(m.render('host', text))).code).toBe('LIMIT');
  });
});

describe('block types that cannot be drawn', () => {
  const text = [
    'flowchart LR',
    '  A --> talk',
    '  mermaid talk["Talk"] {',
    '    %% the conversation',
    '    sequenceDiagram',
    '      A->>B: hi',
    '  }',
  ].join('\n');

  it('names an unregistered block type under mermaid/slim, at the type line', async () => {
    const e = await rejection(createSlim({ diagrams: [flowchart] }).render('host', text));
    expect(e.code).toBe('UNSUPPORTED_DIAGRAM');
    expect(e.message).toContain('"sequence"');
    expect(e.message).toContain('mermaid talk');
    expect(e.line).toBe(5);
    expect(e.column).toBe(5);
    const viaParse = await rejection(createSlim({ diagrams: [flowchart] }).parse(text));
    expect(viaParse.line).toBe(5);
  });

  it('names the type in renderSync too', async () => {
    const m = createSlim({ diagrams: [flowchart] });
    await m.prepare('flowchart LR\n  A');
    let e: unknown;
    try {
      m.renderSync(text);
    } catch (err) {
      e = err;
    }
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).message).toContain('"sequence"');
    expect((e as MermaidError).line).toBe(5);
  });

  it('names the word that is not a diagram type', async () => {
    const bad = text.replace('sequenceDiagram', 'sequenceDiagrm');
    const e = await rejection(createMermaid().render('host', bad));
    expect(e.line).toBe(5);
    expect(e.message).toContain('`sequenceDiagrm` is not a diagram type');
  });
});

describe('block ids', () => {
  const block = (id: string) => [`  mermaid ${id} {`, '    pie', '      "a" : 1', '  }'];

  it('rejects a second block with the same id, at the second', async () => {
    const text = ['flowchart LR', ...block('x'), ...block('x')].join('\n');
    const e = await rejection(createMermaid().render('host', text));
    expect(e.code).toBe('SEMANTIC');
    expect(e.line).toBe(6);
    expect(e.column).toBe(11);
    expect(e.message).toContain('`x`');
  });

  it('rejects a node with its own shape or label under a block id, either order', async () => {
    const before = ['flowchart LR', '  x[Box] --> y', ...block('x')].join('\n');
    expect((await rejection(createMermaid().render('host', before))).line).toBe(2);
    const after = ['flowchart LR', ...block('x'), '  y --> x(Round)'].join('\n');
    const e = await rejection(createMermaid().render('host', after));
    expect(e.line).toBe(6);
    expect(e.column).toBe(9);
  });

  it('rejects a subgraph with a block id', async () => {
    const text = ['flowchart LR', '  subgraph x', '    a', '  end', ...block('x')].join('\n');
    expect((await rejection(createMermaid().render('host', text))).line).toBe(5);
  });

  it('accepts edges, class and style on a block id, and the same id in another block', async () => {
    const text = [
      'flowchart LR',
      '  a --> x',
      '  mermaid x {',
      '    flowchart LR',
      '      x --> a',
      '      mermaid y {',
      '        pie',
      '          "a" : 1',
      '      }',
      '  }',
      '  x --> b',
      '  class x c',
      '  style x stroke:red',
      '  mermaid y {',
      '    pie',
      '      "b" : 1',
      '  }',
    ].join('\n');
    expect(roots((await createMermaid().render('host', text)).svg)).toHaveLength(4);
  });
});

describe('block config', () => {
  /** A host holding one sequence block whose body starts with `head`. */
  const withHead = (...head: string[]) =>
    [
      'flowchart LR',
      '  A --> talk',
      '  mermaid talk {',
      ...head.map((l) => `    ${l}`),
      '    sequenceDiagram',
      '      Alice->>Bob: hi',
      '  }',
    ].join('\n');
  const innerHeight = (svg: string) => Number(attr(roots(svg)[1]!, 'height'));

  it('takes diagram-specific keys from the block front matter', async () => {
    const plain = await createMermaid().render('host', withHead());
    const tuned = await createMermaid().render(
      'host',
      withHead('---', 'config:', '  sequence:', '    mirrorActors: false', '---')
    );
    expect(innerHeight(tuned.svg)).toBeLessThan(innerHeight(plain.svg));
    expect(tuned.warnings).toEqual(plain.warnings);
  });

  it('applies an init directive in a block to the block, not to the host', async () => {
    const plain = await createMermaid().render('host', withHead());
    const tuned = await createMermaid().render(
      'host',
      withHead(
        '%%{init: {"sequence": {"mirrorActors": false}, "flowchart": {"useMaxWidth": false}}}%%'
      )
    );
    expect(innerHeight(tuned.svg)).toBeLessThan(innerHeight(plain.svg));
    // The host keeps its own config: still drawn at 100% width.
    expect(attr(roots(tuned.svg)[0]!, 'width')).toBe('100%');
  });

  it('ignores theme, look and secure keys in a block with one warning', async () => {
    const plain = await createMermaid().render('host', withHead());
    const text = withHead(
      '---',
      'config:',
      '  theme: dark',
      '  look: handDrawn',
      '  securityLevel: loose',
      '  themeVariables:',
      '    primaryColor: "#ff0000"',
      '---',
      '%%{init: {"theme": "forest", "fontFamily": "serif"}}%%'
    );
    const { svg, warnings } = await createMermaid().render('host', text);
    expect(svg).toBe(plain.svg);
    const added = warnings.filter((w) => !plain.warnings.some((p) => p.code === w.code));
    expect(added.map((w) => w.code)).toEqual(['EMBED_CONFIG_IGNORED']);
    for (const key of ['theme', 'look', 'securityLevel', 'themeVariables', 'fontFamily'])
      expect(added[0]!.message).toContain(`\`${key}\``);
  });
});

describe('text output keeps the block checks', () => {
  const asText = { format: 'ascii' } as const;

  it('rejects a fifth level at its opening line', async () => {
    const e = await rejection(createMermaid().render('host', nested(5), asText));
    expect(e.message).toContain('nested more than 4');
    expect(e.line).toBe(10);
  });

  it('counts edges across blocks against maxEdges', async () => {
    const m = createMermaid();
    m.initialize({ maxEdges: 1 });
    const text = [
      'flowchart LR',
      '  A --> b',
      '  mermaid b {',
      '    flowchart LR',
      '      C --> D',
      '  }',
    ];
    const e = await rejection(m.render('host', text.join('\n'), asText));
    expect(e.code).toBe('LIMIT');
    expect(e.limit).toBe('maxEdges');
  });

  it('warns once for host-only keys in a block', async () => {
    const text = [
      'flowchart LR',
      '  mermaid talk {',
      '    %%{init: {"theme": "forest"}}%%',
      '    sequenceDiagram',
      '      A->>B: hi',
      '  }',
    ];
    const { warnings } = await createMermaid().render('host', text.join('\n'), asText);
    expect(warnings.filter((w) => w.code === 'EMBED_CONFIG_IGNORED')).toHaveLength(1);
  });
});
