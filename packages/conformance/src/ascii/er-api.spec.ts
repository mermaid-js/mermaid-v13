import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';

// ER text output through the public API (#136 acceptance; D80): the format is declared, and
// `renderSync` returns the text result once `prepare` has loaded the `./ascii` entry.
describe('er ascii through the API', () => {
  it('supports ascii and renders text with columns, rows and warnings', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    expect(m.supportsFormat('er', 'ascii')).toBe(true);
    const src = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  style ORDER fill:#f00';
    await m.prepare(src, { format: 'ascii' });
    const out = m.renderSync(src, { format: 'ascii' });
    expect(out).toMatchObject({ format: 'ascii', diagramType: 'er' });
    const lines = out.text.split('\n');
    expect(out.rows).toBe(lines.length);
    expect(out.columns).toBe(Math.max(...lines.map((l) => [...l].length)));
    // v12's px defaults do not convert in cells (D118, D124): the box fits the name, no 13-column
    // minimum from minEntityWidth 100.
    expect(lines[1]).toBe('│ CUSTOMER │');
    expect(out.warnings.map((w) => [w.code, w.feature, w.astIds])).toEqual([
      ['ASCII_DROPPED', 'style', ['n:ORDER', 'style:1']],
    ]);
  });

  it('fits ascii.maxWidth as the flowchart does: tighten, then turn LR to TB (D84, D124)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const src =
      'erDiagram\n  direction LR\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n';
    const at = async (maxWidth?: number) => {
      const ascii = maxWidth === undefined ? {} : { maxWidth };
      const out = await m.render('er-w', src, { format: 'ascii', ascii });
      return { columns: out.columns, rows: out.rows, codes: out.warnings.map((w) => w.code) };
    };
    const wide = await at();
    expect(wide.rows).toBe(3);
    // Under the cell profile's turn breakpoint (80) the drawing runs down and fits.
    const down = await at(30);
    expect(down.columns).toBeLessThanOrEqual(30);
    expect(down.rows).toBeGreaterThan(wide.rows);
    expect(down.codes).toEqual([]);
    // Never cropped: narrower than the widest table, it says so.
    const narrow = await at(8);
    expect(narrow.columns).toBeGreaterThan(8);
    expect(narrow.codes).toEqual(['ASCII_TOO_WIDE']);
  });
});
