/**
 * Embedded diagrams in text output (ADR-15, #668): `format: 'ascii'` of a flowchart with
 * `mermaid <id>["Title"] { … }` blocks, checked at the public API seam.
 */
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

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

const SEQUENCE = ['sequenceDiagram', '  U->>S: credentials', '  S-->>U: token'].join('\n');

async function ascii(text: string, options?: { charset?: 'ascii' | 'unicode'; maxWidth?: number }) {
  const m = createMermaid();
  const call = { format: 'ascii', ...(options ? { ascii: options } : {}) } as const;
  await m.prepare(text, call);
  return m.renderSync(text, call);
}

/** The row and column where `inner`'s lines appear one under the other in `outer`, or undefined. */
function placed(outer: string, inner: string): { row: number; col: number } | undefined {
  const rows = outer.split('\n');
  const lines = inner.split('\n');
  for (let row = 0; row + lines.length <= rows.length; row++) {
    const col = rows[row]!.indexOf(lines[0]!);
    if (col < 0) continue;
    if (lines.every((l, i) => rows[row + i]!.slice(col, col + l.length) === l)) return { row, col };
  }
  return undefined;
}

describe('a mermaid block in text output', () => {
  it('draws a block whose type has text output as that text inside a titled frame', async () => {
    const inner = (await ascii(SEQUENCE)).text;
    const out = await ascii(LOGIN);
    const at = placed(out.text, inner);
    expect(at, out.text).toBeDefined();
    const rows = out.text.split('\n');
    const { row, col } = at!;
    const lines = inner.split('\n');
    // The frame: the title in a strip with a divider under it, a border either side of the
    // inner drawing (one cell of padding) and under it.
    const left = col - 2;
    const right = left + rows[row - 1]!.slice(left).trimEnd().length - 1;
    expect(rows[row - 1]!.slice(left, right + 1)).toMatch(/^├─+┤$/);
    expect(rows[row - 2]!.slice(left, right + 1)).toMatch(/^│ +Login flow +│$/);
    expect(rows[row - 3]!.slice(left, right + 1)).toMatch(/^┌─+┐$/);
    for (let i = row; i < row + lines.length; i++) {
      // An edge leaving the block makes a tee in its border.
      expect(rows[i]![left], rows[i]).toMatch(/[│┤]/);
      expect(rows[i]![right], rows[i]).toMatch(/[│├]/);
    }
    expect(rows[row + lines.length]!.slice(left, right + 1)).toMatch(/^└─+┘$/);
    expect(out.warnings).toEqual([]);
  });

  it('draws a block whose type has no text output as a titled frame with its type and one warning', async () => {
    const text = [
      'flowchart TB',
      '  A --> model',
      '  mermaid model["Domain model"] {',
      '    classDiagram',
      '      class User {',
      '        +name: string',
      '      }',
      '  }',
    ].join('\n');
    const out = await ascii(text);
    const rows = out.text.split('\n');
    const title = rows.findIndex((r) => /│ +Domain model +│/.test(r));
    expect(title, out.text).toBeGreaterThan(0);
    expect(rows[title + 1]).toMatch(/├─+┤/);
    const at = rows.findIndex((r) => r.includes('[classDiagram]'));
    expect(at, out.text).toBeGreaterThan(title + 1);
    expect(rows[at]).toMatch(/│ +\[classDiagram\] +│/);
    expect(out.text).not.toContain('User');
    expect(out.warnings).toEqual([
      expect.objectContaining({ code: 'ASCII_DROPPED', feature: 'embed' }),
    ]);
    expect(out.warnings[0]!.message).toContain('model');
  });

  it("draws the inner diagram in the host's charset", async () => {
    const inner = (await ascii(SEQUENCE, { charset: 'ascii' })).text;
    const out = await ascii(LOGIN, { charset: 'ascii' });
    expect(placed(out.text, inner), out.text).toBeDefined();
    expect(out.text).not.toMatch(/[\u2500-\u257f]/);
  });

  it('fits only the whole drawing to ascii.maxWidth, with one warning when it is wider', async () => {
    const out = await ascii(LOGIN, { maxWidth: 20 });
    expect(out.text).toContain('credentials');
    expect(out.warnings.map((w) => w.code)).toEqual(['ASCII_TOO_WIDE']);
  });

  it('draws a block inside a block, the innermost first', async () => {
    const text = [
      'flowchart TB',
      '  mermaid outer["Outer"] {',
      '    flowchart LR',
      '      X --> inner',
      '      mermaid inner["Inner"] {',
      '        sequenceDiagram',
      '          U->>S: credentials',
      '          S-->>U: token',
      '      }',
      '  }',
    ].join('\n');
    const out = await ascii(text);
    expect(placed(out.text, (await ascii(SEQUENCE)).text), out.text).toBeDefined();
    const titles = out.text.split('\n').filter((r) => /│ +(Outer|Inner) +│/.test(r));
    expect(titles).toHaveLength(2);
    expect(out.warnings).toEqual([]);
  });
});
