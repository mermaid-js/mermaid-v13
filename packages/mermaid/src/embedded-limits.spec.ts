/**
 * Embedded diagrams (ADR-15, #666): nesting, errors, config and limits of `mermaid` blocks,
 * checked at the public API seam: text in, SVG, errors and warnings out.
 */
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError } from './index.ts';

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
