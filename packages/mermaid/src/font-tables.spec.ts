/**
 * Integrator font tables (D645, DESIGN §5.1): `initialize({ fontTables })` measures with them
 * wherever the table measurer measures, diagram text cannot set them, they load with the first
 * `prepare()`, `render()` or `preload()`, which a malformed entry rejects with a `SEMANTIC` error,
 * and they enter the determinism key by their table measurer's id (R-ARCH-6).
 */
import { describe, expect, it } from 'vitest';
import type { FontTable } from '@mermaid-js/core/text';
import { createMermaid, MermaidError } from './index.ts';
import type { InitializeConfig } from './api.ts';

const FLOW = 'flowchart LR\n  accTitle: T\n  A[Measurements] --> B[x]\n';
// The family the diagrams are drawn in: Arial's table without font tables.
const FONT = { fontFamily: 'Acme, Arial' };
const size = (r: { width: number; height: number }): number[] => [r.width, r.height];
const prefix = (svg: string): string => /\bid="(mermaid-[0-9a-z]+)/.exec(svg)?.[1] ?? '';

// A table for Acme, every advance `units`/1000 em, '~' (U+007E) `tilde`.
function wide(units = 1000, tilde = units, extra: Partial<FontTable> = {}): FontTable {
  const digits = (n: number): string => n.toString(36).padStart(2, '0');
  const tildeAt = 0x7e - 0x20;
  const regular = Array.from({ length: 191 }, (_, i) => digits(i === tildeAt ? tilde : units));
  return {
    format: 1,
    family: 'Acme',
    ascent: 900,
    descent: 250,
    lineGap: 0,
    regular: regular.join(''),
    ...extra,
  };
}

async function render(config: InitializeConfig = {}, text = FLOW) {
  const m = createMermaid();
  m.initialize({ ...FONT, ...config });
  // No id, so the svg ids start with the default, keyed prefix.
  await m.prepare(text);
  return m.renderSync(text);
}

describe('initialize({ fontTables }) (D645)', () => {
  it('measures with the tables in Node and under deterministic: true', async () => {
    const plain = await render();
    const tables = await render({ fontTables: [wide()] });
    expect(tables.height).toBeGreaterThan(plain.height);
    const deterministic = await render({ fontTables: [wide()], deterministic: true });
    expect(size(deterministic)).toEqual(size(tables));
  });

  it('measures as before with no tables or an empty list', async () => {
    const plain = await render();
    expect((await render({ fontTables: [] })).svg).toBe(plain.svg);
    expect((await render({ fontTables: undefined })).svg).toBe(plain.svg);
  });

  it('measures with tables passed per call', async () => {
    const m = createMermaid();
    m.initialize(FONT);
    const plain = await m.render('f', FLOW);
    const tables = await m.render('f', FLOW, { config: { fontTables: [wide()] } });
    expect(tables.height).toBeGreaterThan(plain.height);
    expect((await m.render('f', FLOW)).svg).toBe(plain.svg);
    expect((await m.render('f', FLOW, { config: { fontTables: [wide()] } })).svg).toBe(tables.svg);
  });

  it('keeps an integrator measurer over the tables, except under deterministic: true', async () => {
    const measurer = {
      id: 'fixed',
      width: (text: string) => text.length * 3,
      metrics: () => ({ ascent: 10, descent: 4, lineHeight: 14 }),
    };
    const own = await render({ measurer });
    expect(size(await render({ measurer, fontTables: [wide()] }))).toEqual(size(own));
    const tables = await render({ fontTables: [wide()] });
    expect(size(tables)).not.toEqual(size(own));
    expect(size(await render({ measurer, fontTables: [wide()], deterministic: true }))).toEqual(
      size(tables)
    );
  });

  it('cannot be set from diagram text (R-SEC-6)', async () => {
    const plain = await render();
    const json = JSON.stringify([wide()]);
    const front = await render({}, `---\nconfig:\n  fontTables: ${json}\n---\n${FLOW}`);
    const directive = await render({}, `%%{init: {"fontTables": ${json}}}%%\n${FLOW}`);
    expect(size(front)).toEqual(size(plain));
    expect(size(directive)).toEqual(size(plain));
    expect(size(await render({ fontTables: [wide()] }))).not.toEqual(size(plain));
  });

  it('rejects a malformed entry at the first prepare() or render(), with a SEMANTIC error naming it', async () => {
    const bad = wide(1000, 1000, { family: 'Acme', regular: 'rs'.repeat(190) });
    const m = createMermaid();
    // initialize() only keeps the tables; they load and are checked with the first prepare().
    m.initialize({ fontTables: [wide(), bad] });
    const rejected = m.prepare(FLOW);
    await expect(rejected).rejects.toBeInstanceOf(MermaidError);
    await expect(rejected).rejects.toMatchObject({
      code: 'SEMANTIC',
      message: 'Font table 1 ("Acme"): regular must be 382 base-36 digits.',
    });
    await expect(m.render('f', FLOW)).rejects.toMatchObject({ code: 'SEMANTIC' });
    const other = createMermaid();
    other.initialize({ fontTables: 'acme' as unknown as FontTable[] });
    await expect(other.render('f', FLOW)).rejects.toMatchObject({
      code: 'SEMANTIC',
      message: 'Font tables must be a list.',
    });
  });

  it('rejects a render with a malformed per-call entry', async () => {
    const bad = { ...wide(), family: '' };
    await expect(
      createMermaid().render('f', FLOW, { config: { fontTables: [bad] } })
    ).rejects.toMatchObject({ name: 'MermaidError', code: 'SEMANTIC' });
  });

  it('is NOT_LOADED in renderSync before prepare(), like a diagram', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    m.initialize({ ...FONT, fontTables: [wide()] });
    expect(() => m.renderSync(FLOW)).toThrow(
      expect.objectContaining({
        code: 'NOT_LOADED',
        missing: [{ kind: 'fontTables', name: 'Acme' }],
      })
    );
    // With placeholders it draws with the built-in tables and says so.
    const stand = m.renderSync(FLOW, { placeholders: true });
    expect(stand.warnings.map((w) => w.code)).toEqual(['PLACEHOLDER']);
    expect(size(stand)).toEqual(size(await render()));
    // Text output does not measure with them, so it neither loads nor needs them.
    await m.prepare(FLOW, { format: 'ascii' });
    expect(m.renderSync(FLOW, { format: 'ascii' }).text).toContain('Measurements');
    expect(() => m.renderSync(FLOW)).toThrow(expect.objectContaining({ code: 'NOT_LOADED' }));
    await m.prepare(FLOW);
    expect(size(m.renderSync(FLOW))).toEqual(size(await render({ fontTables: [wide()] })));
  });

  it('loads the initialize() tables with preload()', async () => {
    const m = createMermaid();
    m.initialize({ ...FONT, fontTables: [wide()] });
    await m.preload({ types: ['flowchart'] });
    expect(size(m.renderSync(FLOW))).toEqual(size(await render({ fontTables: [wide()] })));
  });
});

describe('font tables in the determinism key (R-ARCH-6, D645)', () => {
  it('gives equal tables the same key and the same bytes', async () => {
    const a = await render({ fontTables: [wide()] });
    const b = await render({ fontTables: [wide(1000, 1000, { family: '"ACME"' })] });
    expect(b.svg).toBe(a.svg);
  });

  it('gives different tables different keys, even when the diagram measures the same', async () => {
    // The tables differ only in '~', which FLOW does not use.
    const a = await render({ fontTables: [wide(1000, 1000)] });
    const b = await render({ fontTables: [wide(1000, 400)] });
    expect(b.svg.replaceAll(prefix(b.svg), '')).toBe(a.svg.replaceAll(prefix(a.svg), ''));
    expect(prefix(b.svg)).not.toBe(prefix(a.svg));
    expect(prefix(a.svg)).not.toBe(prefix((await render()).svg));
  });
});
