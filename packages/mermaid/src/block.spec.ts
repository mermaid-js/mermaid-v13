import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { block, parseBlock } from '@mermaid-js/diagram-block';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The block diagram is a first-party type (#558): `block` and `block-beta` go to
// `@mermaid-js/diagram-block` through the generated registry, after xychart and before
// eventmodeling, as in v12's detector order.
const TEXT = [
  'block-beta',
  '  columns 3',
  '  a["A"] b c',
  '  block:g["Group"]:2',
  '    d e',
  '  end',
  '  a --> b',
  '  classDef red fill:#f00',
  '  class c red',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
const count = (svg: string, re: RegExp): number => svg.match(re)?.length ?? 0;

describe('block diagrams through the public API (#558)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('b1', TEXT);
    expect(result.diagramType).toBe('block');
    expect(result.svg).toContain('aria-roledescription="block"');
    expect(result.svg).toContain('class="mermaid mermaid-block"');
    // a, b, c, the composite g and its d and e.
    expect(count(result.svg, /<g class="node [^"]*flowchart-label"/g)).toBe(6);
    expect(count(result.svg, /<rect class="basic cluster composite label-container"/g)).toBe(1);
    expect(count(result.svg, /<path class="edge-thickness-normal [^"]*flowchart-link"/g)).toBe(1);
    expect(result.svg).toContain('<g class="node red flowchart-label" data-id="c"');
    expect(result.svg).toContain('>Group</text>');
    expect(result.svg).not.toContain('foreignObject');
    expect(result.svg).not.toContain('<style');
    expect(result.svg).not.toContain('<marker');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
    const plain = await createMermaid().render('b1', TEXT.replace('block-beta', 'block'));
    expect(plain.diagramType).toBe('block');
    expect(plain.svg).toBe(result.svg);
  });

  it('renders through mermaid/slim, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [block] });
    expect((await slim.render('b2', TEXT)).svg).toBe(
      (await createMermaid().render('b2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('block');
  });

  it('keeps v12’s detector pattern and place, after xychart and before eventmodeling', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('block')).toBe(types.indexOf('xychart') + 1);
    expect(types.indexOf('eventmodeling')).toBe(types.indexOf('block') + 1);
    expect(DETECTORS.find((d) => d.type === 'block')?.pattern.source).toBe('^\\s*block(-beta)?');
    const m = createMermaid();
    // Case-sensitive, with no word boundary, as v12's `/^\s*block(-beta)?/`.
    expect(m.detectType('  block-beta\n  a')).toBe('block');
    expect(m.detectType('block\n  a')).toBe('block');
    expect(m.detectType('blockchain\n  a')).toBe('block');
    expect(() => m.detectType('Block\n  a')).toThrow();
  });

  it('rejects what v12 rejects, detected headers included', async () => {
    const m = createMermaid();
    // `blockchain` is detected as block (no word boundary) and rejected by the grammar, as in v12.
    for (const text of ['blockchain\n  a\n', 'block\n  a["x"\n', 'block\n  columns -1\n']) {
      const e = await rejection(m.render('b3', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
    const e = await rejection(m.render('b3', 'Block\n  a\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('honours block.padding over its generated default 8', async () => {
    const m = createMermaid();
    const body = 'block\n  columns 2\n  a b c\n';
    const plain = await m.render('b4', body);
    const eight = await m.render('b4', '%%{init: {"block": {"padding": 8}}}%%\n' + body);
    expect(eight.svg).toBe(plain.svg);
    const wide = await m.render('b4', '%%{init: {"block": {"padding": 30}}}%%\n' + body);
    expect(box(wide.svg)).not.toBe(box(plain.svg));
    m.initialize({ block: { padding: 30 } });
    expect((await m.render('b4', body)).svg).toBe(wide.svg);
  });

  it('lays an invalid block.padding out at 8, and one over 1,000 at 1,000, warning once (D226, D445)', async () => {
    const m = createMermaid();
    const body = 'block\n  columns 2\n  a b c\n  block:g\n    d\n  end\n';
    const plain = await m.render('b4', body);
    for (const padding of ['-3', '"x"', '"20"', 'null', 'true', '[]']) {
      const r = await m.render('b4', `%%{init: {"block": {"padding": ${padding}}}}%%\n` + body);
      if (padding === 'null') {
        // A null value is dropped by the config reader: the default, and nothing to warn about.
        expect(r.svg, padding).toBe(plain.svg);
        continue;
      }
      expect(r.svg, padding).toBe(plain.svg);
      const codes = r.warnings.map((w) => w.code).filter((c) => c === 'BLOCK_CONFIG_INVALID');
      expect(codes, padding).toEqual(['BLOCK_CONFIG_INVALID']);
      expect(r.warnings.find((w) => w.code === 'BLOCK_CONFIG_INVALID')?.path).toBe('block.padding');
    }
    m.initialize({ block: { padding: Number.POSITIVE_INFINITY } });
    const infinite = await m.render('b4', body);
    expect(infinite.svg).toBe(plain.svg);
    expect(infinite.warnings.map((w) => w.code)).toContain('BLOCK_CONFIG_INVALID');
    const capped = await createMermaid().render(
      'b4',
      '%%{init: {"block": {"padding": 1000}}}%%\n' + body
    );
    expect(capped.warnings).toEqual([]);
    const huge = await createMermaid().render(
      'b4',
      '%%{init: {"block": {"padding": 1e9}}}%%\n' + body
    );
    expect(huge.warnings.map((w) => w.code)).toEqual(['BLOCK_CONFIG_INVALID']);
    expect(huge.warnings[0]!.message).toBe('block.padding is 1000000000, over 1000; using 1000');
    expect(huge.svg).toBe(capped.svg);
    const [, , w, h] = box(huge.svg)!.split(' ').map(Number);
    expect(w).toBeLessThan(20_000);
    expect(h).toBeLessThan(20_000);
  });

  it('honours block.useMaxWidth: false draws the diagram at its own size', async () => {
    const m = createMermaid();
    const body = 'block\n  a b\n';
    const plain = (await m.render('b5', body)).svg;
    expect(plain).toMatch(/<svg [^>]*width="100%"/);
    expect(plain).toContain('max-width:');
    const fixed = (
      await m.render('b5', '---\nconfig:\n  block:\n    useMaxWidth: false\n---\n' + body)
    ).svg;
    const [, , w, h] = box(fixed)!.split(' ');
    expect(fixed).toMatch(new RegExp(`<svg [^>]*width="${w}" height="${h}"`));
    expect(fixed).not.toContain('max-width');
  });

  it('honours a block-scoped theme over the top level, as 12.2.0', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'default' });
    const dark = await m.render('b6', '---\nconfig:\n  theme: dark\n---\n' + TEXT);
    const scoped = await m.render('b6', '%%{init: {"block": {"theme": "dark"}}}%%\n' + TEXT);
    expect(scoped.svg).toBe(dark.svg);
    expect(scoped.svg).not.toBe((await m.render('b6', TEXT)).svg);
  });

  it('ignores block.useWidth and layout, and warns LOOK_REMOVED for block.look (D153)', async () => {
    const m = createMermaid();
    const base = await m.render('b7', TEXT);
    for (const init of [
      '{"block": {"useWidth": 99}}',
      '{"block": {"layout": "elk"}}',
      '{"layout": "dagre"}',
    ]) {
      const r = await m.render('b7', `%%{init: ${init}}%%\n` + TEXT);
      expect(r.svg, init).toBe(base.svg);
      expect(r.warnings, init).toEqual([]);
    }
    const look = await m.render('b7', '%%{init: {"block": {"look": "neo"}}}%%\n' + TEXT);
    expect(look.svg).toBe(base.svg);
    expect(look.warnings.map((w) => w.code)).toEqual(['LOOK_REMOVED']);
  });

  it('lists the labels it draws for extensions, and no style or class text', () => {
    const { model } = parseBlock(
      'block\n  a["A $$x$$"] space b\n  block:g["G"]\n    c\n  end\n  block\n    d\n  end\n' +
        '  a -- "to b" --> b\n  b --> c\n  classDef k fill:#f00\n  style a stroke:#00f\n'
    );
    expect(block.labels(model)).toEqual(['A $$x$$', 'b', 'G', 'c', 'd', 'to b']);
  });

  it('cuts a spacer over 100,000 cells with one BLOCK_TRUNCATED and draws it finite (D445)', async () => {
    const r = await createMermaid().render('b9', 'block\n  columns 3\n  a space:100001 b\n');
    expect(r.warnings.map((w) => w.code)).toEqual(['BLOCK_TRUNCATED']);
    expect(r.svg).not.toMatch(/NaN|Infinity|undefined/);
    const nums = box(r.svg)!.split(' ').map(Number);
    expect(nums.every(Number.isFinite)).toBe(true);
    // 100,000 cells in 3 columns: 33,334 rows, both blocks drawn.
    expect(nums[3]).toBeGreaterThan(1_000_000);
    expect(count(r.svg, /<g class="node [^"]*flowchart-label"/g)).toBe(2);
    assertInert(r.svg);
  }, 60_000);

  it('draws ascii from the lazily loaded ./ascii entry (#559, D449)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    expect(m.supportsFormat('block', 'svg')).toBe(true);
    expect(m.supportsFormat('block', 'ascii')).toBe(true);
    const src = 'block\n  columns 2\n  a["A"] b["Bee"]\n  a --> b';
    const result = await m.render('b8', src, { format: 'ascii' });
    expect(result).toMatchObject({ format: 'ascii', diagramType: 'block' });
    expect(result.text).toBe(
      ['┌─────┐    ┌─────┐', '│  A  ├───►│ Bee │', '└─────┘    └─────┘'].join('\n')
    );
    expect(result.columns).toBe(18);
    expect(result.rows).toBe(3);
    expect(
      m.renderSync(src, { format: 'ascii', config: { ascii: { charset: 'ascii' } } }).text
    ).toBe(['+-----+    +-----+', '|  A  +--->| Bee |', '+-----+    +-----+'].join('\n'));
  });

  it('never crops: a drawing wider than ascii.maxWidth warns ASCII_TOO_WIDE (R-ASCII-8)', async () => {
    const m = createMermaid();
    const src = 'block\n  columns 6\n  a b c d e f';
    const wide = await m.render('b9', src, {
      format: 'ascii',
      config: { ascii: { maxWidth: 10 } },
    });
    expect(wide.text.split('\n')[0]!.length).toBeGreaterThan(10);
    expect(wide.warnings.map((w) => w.code)).toContain('ASCII_TOO_WIDE');
    expect(wide.text.split('\n').every((l) => !l.includes('…'))).toBe(true);
  });

  it('draws a composite a later mention made a circle as a circle in SVG and text alike', async () => {
    // v12's merge rule: a later type other than `na` wins, so `a` is a circle holding b and c.
    const m = createMermaid();
    const src = 'block\nblock:a["Grp"]\n b c\nend\na(("x"))';
    const { svg } = await m.render('b11', src);
    const groups = svg.match(/<g class="node [^"]*"[^>]*data-id="(a|b|c)"[^>]*>\s*<(\w+)/g) ?? [];
    expect(groups.map((g) => /data-id="(\w)"[^>]*>\s*<(\w+)/.exec(g)!.slice(1).join(':'))).toEqual([
      'a:circle',
      'b:rect',
      'c:rect',
    ]);
    expect(svg).not.toContain('composite');
    const { text } = await m.render('b11', src, { format: 'ascii' });
    // The circle's text form (rounded), its label inside, no frame titled "x"; b and c below it.
    expect(text).toBe(
      [
        '╭────────────╮',
        '│     x      │',
        '╰────────────╯',
        '',
        '',
        '┌───┐    ┌───┐',
        '│ b │    │ c │',
        '└───┘    └───┘',
      ].join('\n')
    );
  });

  it('draws composites 1,200 deep as text, past where a recursive grid ran out of stack', async () => {
    // The text grid is iterative (as the layout and the SVG renderer are). The drawing grows by
    // a frame each level, so the output limit is raised with the depth.
    const depth = 1200;
    const m = createMermaid();
    m.initialize({ limits: { maxDepth: 10_000, maxOutputLength: 1e9 } });
    const src = 'block\n' + 'block\n'.repeat(depth) + 'a\n' + 'end\n'.repeat(depth);
    const { text, rows, columns } = await m.render('b12', src, { format: 'ascii' });
    expect(rows).toBe(3 + 4 * depth);
    expect(columns).toBe(5 + 6 * depth);
    const middle = text.split('\n')[2 * depth + 1]!;
    expect(middle).toBe('│  '.repeat(depth) + '│ a │' + '  │'.repeat(depth));
  }, 60_000);

  it('ignores block.padding in text, an invalid one included, with no warning (D449)', async () => {
    const m = createMermaid();
    const src = 'block\n  a b';
    const plain = await m.render('b10', src, { format: 'ascii' });
    for (const padding of [40, -1, 'x']) {
      const r = await m.render('b10', src, {
        format: 'ascii',
        config: { block: { padding } } as never,
      });
      expect(r.text).toBe(plain.text);
      expect(r.warnings).toEqual([]);
    }
  });
});
