import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { block, parseBlock } from '@mermaid-js/diagram-block';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
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

  it('supports svg only until #559: ascii is refused with UnsupportedFormatError (R-ASCII-5)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('block', 'svg')).toBe(true);
    expect(m.supportsFormat('block', 'ascii')).toBe(false);
    const e = await rejection(m.render('b8', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('block');
  });
});
