/**
 * Folded embedded diagrams (ADR-15, #670): `id@{ view: collapsed }` on a `mermaid` block, in
 * flowchart and state hosts, checked at the public API seam: text in, SVG, text and errors out.
 */
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { createMermaid, NotLoadedError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

const FOLDED = [
  'flowchart LR',
  '  A --> login',
  '  mermaid login["Login flow"] {',
  '    sequenceDiagram',
  '      U->>S: credentials',
  '  }',
  '  login@{ view: collapsed }',
  '  login --> B',
].join('\n');

/** Start tags of every `<svg>` in the output, the outer root first. */
function roots(svg: string): string[] {
  return [...svg.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
}

/** The folded block's `<g>` with everything in it. */
function folded(svg: string, id: string): string {
  const at = svg.indexOf(`data-id="${id}"`);
  expect(at, svg).toBeGreaterThan(-1);
  const start = svg.lastIndexOf('<g', at);
  let depth = 0;
  for (const m of svg.slice(start).matchAll(/<(\/?)g\b[^>]*?(\/?)>/g)) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return svg.slice(start, start + m.index + m[0].length);
  }
  throw new Error('unclosed <g>');
}

describe('a folded block in a flowchart', () => {
  it('draws the folded shape with the title and the inner type, and no inner diagram', async () => {
    const { svg } = await createMermaid().render('host', FOLDED);
    expect(roots(svg)).toHaveLength(1);
    const g = folded(svg, 'login');
    expect(g).toMatch(/^<g class="node embed folded"/);
    expect(g).toContain('Login flow');
    // Small capitals: capitals at a smaller size (the allow-list has no font-variant).
    expect(g).toContain('>SEQUENCE<');
    expect(g).not.toContain('credentials');
    // The frame, four corner brackets, the divider and the diagram icon.
    expect(g.match(/class="corner"/g)).toHaveLength(4);
    expect(g).toContain('class="divider"');
    expect(g).toContain('class="diagram-icon"');
    assertInert(svg);
  });
});

describe('what a folded block never needs', () => {
  it('renders when its type is not registered (mermaid/slim)', async () => {
    const { svg } = await createSlim({ diagrams: [flowchart] }).render('host', FOLDED);
    expect(folded(svg, 'login')).toContain('>SEQUENCE<');
  });

  it('renders and parses when its body is invalid', async () => {
    const bad = FOLDED.replace('U->>S: credentials', '->> ->> :: not a message');
    const m = createMermaid();
    await expect(m.parse(bad)).resolves.toBeTruthy();
    const { svg } = await m.render('host', bad);
    expect(folded(svg, 'login')).toContain('>SEQUENCE<');
  });

  it('does not load the inner plugin', async () => {
    const m = createMermaid();
    await m.prepare(FOLDED);
    m.renderSync(FOLDED);
    // prepare() loaded what the folded text draws with: the sequence plugin is not among it.
    expect(() => m.renderSync('sequenceDiagram\n  A->>B: hi')).toThrow(NotLoadedError);
  });

  it('shows the first word of a type line no detector knows, with no error', async () => {
    const text = FOLDED.replace('sequenceDiagram', 'notADiagram');
    const { svg } = await createMermaid().render('host', text);
    expect(folded(svg, 'login')).toContain('>NOTADIAGRAM<');
  });

  it('shows the type of a block without a plugin package by its name', async () => {
    const text = FOLDED.replace('sequenceDiagram', 'classDiagram');
    const { svg } = await createMermaid().render('host', text);
    expect(folded(svg, 'login')).toContain('>CLASS<');
  });
});

describe('a folded block in text output', () => {
  async function ascii(text: string, charset?: 'ascii' | 'unicode') {
    const m = createMermaid();
    const call = { format: 'ascii', ...(charset ? { ascii: { charset } } : {}) } as const;
    await m.prepare(text, call);
    return m.renderSync(text, call);
  }

  /** The rows of the box whose top-left corner is the first `corner` in `text`. */
  function box(text: string, corner: string): string[] {
    const rows = text.split('\n');
    const top = rows.findIndex((r) => r.includes(corner));
    const left = rows[top]!.indexOf(corner);
    const right = left + 2 + rows[top]!.slice(left + 2).search(/[┐+]/);
    const out: string[] = [];
    for (let i = top; i < rows.length; i++) {
      out.push(rows[i]!.slice(left, right + 1));
      if (i > top && /^[└+][─-]+[┘+]$/.test(out[out.length - 1]!)) break;
    }
    return out;
  }

  it('draws it like a folded subgraph, with a dotted divider and the type under it', async () => {
    const out = await ascii(FOLDED);
    expect(out.warnings).toEqual([]);
    expect(out.text).not.toContain('credentials');
    expect(box(out.text, '┌+')).toEqual([
      '┌+───────────┐',
      '│ Login flow │',
      // The edges meet the box on the divider row; the one leaving it makes a cross.
      '├┄┄┄┄┄┄┄┄┄┄┄┄┼',
      '│  sequence  │',
      '└────────────┘',
    ]);
  });

  it('draws it in the ascii charset too', async () => {
    const out = await ascii(FOLDED, 'ascii');
    expect(box(out.text, '++')).toEqual([
      '++-----------+',
      '| Login flow |',
      '+............+',
      '|  sequence  |',
      '+------------+',
    ]);
  });
});
