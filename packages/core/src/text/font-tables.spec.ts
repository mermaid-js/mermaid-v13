import { describe, expect, it, vi } from 'vitest';
import { Style, type FontKey, type Measurer } from './measurer.ts';
import { layoutLabel } from './label.ts';
import { MermaidError } from '../pipeline/errors.ts';
import { createTableMeasurer, type FontTable } from './font-tables.ts';
import { tableMeasurer } from './table.ts';

// Hand-written tables (D645): every advance the same, packed as in `FACES` (191 per weight).
const packed = (units: number): string => units.toString(36).padStart(2, '0').repeat(191);
const table = (family: string, units: number, extra: Partial<FontTable> = {}): FontTable => ({
  format: 1,
  family,
  ascent: 800,
  descent: 200,
  lineGap: 100,
  regular: packed(units),
  ...extra,
});
const font = (family: string, size = 10, weight = 400): FontKey => ({ family, size, weight });
const ACME = table('Acme Sans', 500, { aliases: ['acme'], bold: packed(700) });

describe('createTableMeasurer', () => {
  it('measures a family with its own table, by family and by alias', () => {
    const m = createTableMeasurer({ faces: [ACME] });
    expect(m.width('abc', font('Acme Sans'), 0)).toBe(15);
    expect(m.width('abc', font('"ACME SANS", sans-serif'), 0)).toBe(15);
    expect(m.width('abc', font("'acme'"), 0)).toBe(15);
    expect(m.width('abc', font('Acme Sans'), Style.Bold)).toBe(21);
    expect(m.width('abc', font('Acme Sans', 10, 700), 0)).toBe(21);
    expect(m.metrics(font('acme', 20))).toEqual({ ascent: 16, descent: 4, lineHeight: 22 });
  });

  it('uses the regular advances for bold text when the table has no bold', () => {
    const m = createTableMeasurer({ faces: [table('Plain', 400)] });
    expect(m.width('ab', font('Plain'), Style.Bold)).toBe(m.width('ab', font('Plain'), 0));
    expect(m.width('ab', font('Plain'), Style.Bold)).toBe(8);
  });

  it('looks up the given tables, then the built-ins and their aliases, then Arial', () => {
    const m = createTableMeasurer({ faces: [ACME, table('Verdana', 900)] });
    const builtIn = (family: string): number => tableMeasurer.width('Hello', font(family), 0);
    // A given table wins over the built-in of the same name.
    expect(m.width('Hello', font('Verdana'), 0)).toBe(45);
    // The first family in the stack with a table wins, given or built-in.
    expect(m.width('Hello', font('Unknown, Acme Sans, Arial'), 0)).toBe(25);
    expect(m.width('Hello', font('Trebuchet MS, Acme Sans'), 0)).toBe(builtIn('Trebuchet MS'));
    // The built-in monospace aliases still name the built-in Courier New table (D644).
    expect(m.width('Hello', font('monospace'), 0)).toBe(builtIn('Courier New'));
    expect(m.width('Hello', font('Menlo'), 0)).toBe(30);
    // Neither given nor built-in: Arial.
    expect(m.width('Hello', font('Comic Neue'), 0)).toBe(builtIn('Arial'));
    expect(m.metrics(font('Comic Neue'))).toEqual(tableMeasurer.metrics(font('Arial')));
  });

  it('takes the first table that names a family', () => {
    const m = createTableMeasurer({ faces: [ACME, table('Other', 900, { aliases: ['acme'] })] });
    expect(m.width('abc', font('acme'), 0)).toBe(15);
    expect(m.width('abc', font('other'), 0)).toBe(27);
  });

  it('keeps each measurer’s tables and caches to itself', () => {
    const a = createTableMeasurer({ faces: [table('Acme', 500)] });
    const b = createTableMeasurer({ faces: [table('Acme', 900)] });
    const acme = font('Acme');
    for (let i = 0; i < 2; i++) {
      expect(a.width('abc', acme, 0)).toBe(15);
      expect(b.width('abc', acme, 0)).toBe(27);
      // The built-in measurer has no Acme table: Arial.
      expect(tableMeasurer.width('abc', acme, 0)).toBe(
        tableMeasurer.width('abc', font('Arial'), 0)
      );
    }
  });

  it('gives each font stack its own face, whichever stack it measured last', () => {
    const m = createTableMeasurer({ faces: [table('Acme', 500), table('Wide', 900)] });
    const arial = tableMeasurer.width('abc', font('Arial'), 0);
    const want: Record<string, number> = { Acme: 15, Wide: 27, Unknown: arial };
    for (const family of ['Acme', 'Acme', 'Wide', 'Acme', 'Wide', 'Wide', 'Unknown', 'Acme'])
      expect(m.width('abc', font(family), 0), family).toBe(want[family]);
    // Past 256 stacks the measurer forgets them and starts again; each keeps its face.
    for (let i = 0; i < 300; i++) expect(m.width('abc', font(`Unknown ${i}, Wide`), 0)).toBe(27);
    expect(m.width('abc', font('Unknown 299, Wide'), 0)).toBe(27);
    expect(m.width('abc', font('Acme'), 0)).toBe(15);
    expect(m.metrics(font('Wide', 20))).toEqual({ ascent: 16, descent: 4, lineHeight: 22 });
  });

  it('is the built-in table measurer without faces', () => {
    const m = createTableMeasurer();
    expect(m.id).toBe('table');
    expect(createTableMeasurer({ faces: [] }).id).toBe('table');
    for (const family of ['Arial', 'Verdana', 'monospace', 'Comic Neue'])
      expect(m.width('Hello wörld 漢', font(family), Style.Bold)).toBe(
        tableMeasurer.width('Hello wörld 漢', font(family), Style.Bold)
      );
  });

  it('keys the id on the normalised tables (R-ARCH-6)', () => {
    const id = (faces: FontTable[]): string => createTableMeasurer({ faces }).id;
    const base = id([table('Acme', 500)]);
    expect(base).toMatch(/^table:[0-9a-z]+$/);
    expect(id([table('Acme', 500)])).toBe(base);
    // Equal after normalising: family case and quotes, digit case, a bold equal to regular.
    expect(id([table('"ACME"', 500)])).toBe(base);
    expect(id([table('Acme', 500, { regular: packed(500).toUpperCase() })])).toBe(base);
    expect(id([table('Acme', 500, { bold: packed(500) })])).toBe(base);
    // Any difference that measures differently changes the id.
    const one = packed(500).replace(/^../, 'dx');
    expect(id([table('Acme', 500, { regular: one })])).not.toBe(base);
    expect(id([table('Acme', 500, { bold: packed(501) })])).not.toBe(base);
    expect(id([table('Acme', 500, { ascent: 801 })])).not.toBe(base);
    expect(id([table('Acme', 500, { aliases: ['a'] })])).not.toBe(base);
    expect(id([table('Acme2', 500)])).not.toBe(base);
    expect(id([table('Acme', 500), table('B', 400)])).not.toBe(
      id([table('B', 400), table('Acme', 500)])
    );
  });

  it('rejects a malformed entry with a SEMANTIC MermaidError that names it', () => {
    const bad = (entry: unknown, message: RegExp): void => {
      const make = (): unknown => createTableMeasurer({ faces: [ACME, entry as FontTable] });
      expect(make).toThrow(MermaidError);
      expect(make).toThrow(expect.objectContaining({ code: 'SEMANTIC' }));
      expect(make).toThrow(message);
    };
    bad(
      table('Bad', 500, { regular: packed(500).slice(2) }),
      /^Font table 1 \("Bad"\): regular must be 382 base-36 digits/
    );
    bad(table('Bad', 500, { regular: '!' + packed(500).slice(1) }), /regular must be 382/);
    bad(table('Bad', 500, { bold: 'zz' }), /^Font table 1 \("Bad"\): bold must be 382/);
    bad({ ...table('x', 500), family: undefined }, /^Font table 1: family must be one family name/);
    bad(table('', 500), /family must be/);
    bad(table('A, B', 500), /family must be/);
    bad(table('Bad', 500, { format: 2 as 1 }), /^Font table 1 \("Bad"\): format must be 1/);
    bad(table('Bad', 500, { aliases: 'x' as unknown as string[] }), /aliases must be a list/);
    bad(table('Bad', 500, { aliases: [''] }), /aliases must be a list/);
    bad(table('Bad', 500, { ascent: -1 }), /ascent must be a number/);
    bad(table('Bad', 500, { lineGap: Number.NaN }), /lineGap must be a number/);
    bad(null, /^Font table 1: format must be 1/);
    expect(() => createTableMeasurer({ faces: 'x' as unknown as FontTable[] })).toThrow(
      'Font tables must be a list.'
    );
  });
});

describe('label layout with a created table measurer', () => {
  // A copy that hides the slice marker, so label layout measures sliced strings with `width`.
  const sliced = (m: Measurer): Measurer => ({
    id: m.id,
    width: (t, f, s) => m.width(t, f, s),
    metrics: (f) => m.metrics(f),
  });

  it('lays out bit for bit as the measurer’s own width does', () => {
    const m = createTableMeasurer({ faces: [table('Acme', 437, { bold: packed(613) })] });
    const raw = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod';
    for (const family of ['Acme', 'Verdana', 'Comic Neue'])
      for (const max of [37.3, 61.7, 120]) {
        const f = font(family, 13.7);
        expect(layoutLabel(raw, f, max, m)).toEqual(layoutLabel(raw, f, max, sliced(m)));
      }
  });

  it('measures slices with the table, not by slicing the label', () => {
    const m = createTableMeasurer({ faces: [table('Acme', 437)] });
    const width = vi.spyOn(m, 'width');
    const box = layoutLabel('aaa aaa aaa aaa aaa', font('Acme'), 40, m);
    expect(box.lines.length).toBeGreaterThan(1);
    expect(width.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('measures a spread copy with its own width by that width', () => {
    const doubled = {
      ...tableMeasurer,
      width: (...a: Parameters<Measurer['width']>) => 2 * tableMeasurer.width(...a),
    };
    const f = font('Arial');
    const raw = 'aaa aaa aaa aaa';
    expect(layoutLabel(raw, f, 40, doubled)).toEqual(layoutLabel(raw, f, 40, sliced(doubled)));
  });
});
