import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import {
  sankey,
  SANKEY_COLOR_INVALID,
  SANKEY_CONFIG_INVALID,
  SANKEY_INVALID_VALUE,
} from '@mermaid-js/diagram-sankey';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// Sankey diagrams are a first-party type (#503): `sankey` and `sankey-beta` go to
// `@mermaid-js/diagram-sankey` through the generated registry, after quadrantChart and before
// packet as in v12's detector order, and no longer fail with UNSUPPORTED_DIAGRAM (R-COMPAT-7).
const TEXT = [
  'sankey',
  '',
  'Solar,Electricity,40',
  'Gas,Electricity,60',
  'Electricity,Homes,100',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withInit = (sankeyConfig: object, text = TEXT): string =>
  `%%{init: ${JSON.stringify({ sankey: sankeyConfig })}}%%\n${text}`;
const rects = (svg: string): string[] =>
  [...svg.matchAll(/<g class="node"[^>]*><rect ([^>]*)\/>/g)].map((m) => m[1]!);
const fills = (svg: string): string[] => rects(svg).map((r) => /fill="([^"]*)"/.exec(r)?.[1] ?? '');
const strokes = (svg: string): string[] =>
  [...svg.matchAll(/<g class="link"[^>]*><path [^>]*stroke="([^"]*)"/g)].map((m) => m[1]!);

describe('sankey diagrams through the public API (#503)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('s1', TEXT);
    expect(result.diagramType).toBe('sankey');
    expect(result.svg).toContain('aria-roledescription="sankey"');
    expect(result.svg).toContain('class="mermaid mermaid-sankey"');
    expect(result.svg.match(/<g class="node"/g)).toHaveLength(4);
    expect(result.svg.match(/<g class="link"/g)).toHaveLength(3);
    expect(result.svg).toContain('<linearGradient');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim with the plugin passed in, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [sankey] });
    expect((await slim.render('s2', TEXT)).svg).toBe(
      (await createMermaid().render('s2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('sankey');
  });

  it('keeps v12’s detector pattern and place, after quadrantChart and before packet', async () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('sankey')).toBe(types.indexOf('quadrantChart') + 1);
    expect(types.indexOf('packet')).toBe(types.indexOf('sankey') + 1);
    const m = createMermaid();
    // Case-sensitive, with no word boundary, as v12's `/^\s*sankey(-beta)?/`.
    expect(m.detectType('  sankey\na,b,1')).toBe('sankey');
    expect(m.detectType('sankey-beta\na,b,1')).toBe('sankey');
    expect(m.detectType('sankeyx\na,b,1')).toBe('sankey');
    expect(() => m.detectType('Sankey\na,b,1')).toThrow();
    expect((await m.render('s3', 'sankey-beta\na,b,1\n')).diagramType).toBe('sankey');
  });

  it('rejects a header the detector takes but the grammar does not, and what v12 rejects', async () => {
    const m = createMermaid();
    for (const [text, code] of [
      ['sankeyx\na,b,1\n', 'SYNTAX'],
      ['Sankey\na,b,1\n', 'UNSUPPORTED_DIAGRAM'],
      ['sankey\na,b\n', 'SYNTAX'],
    ] as const) {
      const e = await rejection(m.render('s4', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe(code);
    }
  });

  it('rejects a cycle at parse, naming a node on it (D393)', async () => {
    const e = await rejection(createMermaid().render('s5', 'sankey\na,b,1\nb,a,1\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).message).toContain(
      'Sankey diagrams cannot have circular links, and "a" is part of one.'
    );
  });

  it('counts an invalid value as 0 with one SANKEY_INVALID_VALUE warning (D394)', async () => {
    const result = await createMermaid().render('s6', 'sankey\na,b,x\nb,c,-1\nc,d,1\n');
    expect(result.warnings.map((w) => w.code)).toEqual([SANKEY_INVALID_VALUE]);
    expect(result.svg).not.toMatch(/NaN|undefined/);
  });

  it('gives the front-matter title to the SVG <title> and draws none (D396)', async () => {
    const svg = (await createMermaid().render('s7', `---\ntitle: Energy\n---\n${TEXT}`)).svg;
    expect(svg).toContain('<title id="s7-title">Energy</title>');
    expect(svg).toContain('aria-labelledby="s7-title"');
    expect(svg).not.toMatch(/<text[^>]*>Energy</);
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('sankey', 'svg')).toBe(true);
    expect(m.supportsFormat('sankey', 'ascii')).toBe(false);
    const e = await rejection(m.render('s8', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('sankey');
  });

  it('has a schema default for every sankey key the layout and renderer read', () => {
    expect(sankey.configDefaults).toEqual({
      useMaxWidth: true,
      width: 600,
      height: 400,
      linkColor: 'gradient',
      nodeAlignment: 'justify',
      showValues: true,
      prefix: '',
      suffix: '',
      nodeWidth: 10,
      nodePadding: 12,
      labelStyle: 'legacy',
    });
  });

  it('honours the sankey config section over its generated defaults', async () => {
    const m = createMermaid();
    const plain = await m.render('s9', TEXT);
    // v12 12.2.0 drew every sankey without the key at the container's width (GAPS #503).
    expect(plain.svg).toMatch(/<svg [^>]*width="100%"/);
    expect(plain.svg).toContain('max-width');
    const off = await m.render('s9', withInit({ useMaxWidth: false }));
    expect(off.svg).toMatch(/<svg [^>]*width="\d+" height="\d+"/);
    expect(off.svg).not.toContain('max-width');
    const sized = await m.render('s9', withInit({ width: 300, height: 200, nodeWidth: 30 }));
    // The viewBox is what is drawn (D224): the extent, and a label or stroke reaching past it.
    expect(sized.width).toBe(300);
    expect(sized.height).toBeGreaterThanOrEqual(200);
    expect(rects(sized.svg).every((r) => r.includes('width="30"'))).toBe(true);
    const shown = await m.render('s9', withInit({ prefix: '$', suffix: ' bn' }));
    expect(shown.svg).toContain('Homes $100 bn');
    expect((await m.render('s9', withInit({ showValues: false }))).svg).not.toContain('Homes 100');
    const coloured = await m.render('s9', withInit({ nodeColors: { Gas: '#123456' } }));
    // Nodes in first-occurrence order: Solar, Electricity, Gas, Homes.
    expect(fills(coloured.svg)[2]).toBe('#123456');
    expect(strokes((await m.render('s9', withInit({ linkColor: 'source' }))).svg)[0]).toBe(
      fills(plain.svg)[0]
    );
    expect(strokes((await m.render('s9', withInit({ linkColor: '#abcdef' }))).svg)).toEqual(
      Array(3).fill('#abcdef')
    );
    for (const r of [off, sized, shown, coloured]) expect(r.warnings).toEqual([]);
  });

  it('ignores sankey.useWidth, which v12’s sankey never read', async () => {
    const base = await createMermaid().render('s10', TEXT);
    const set = await createMermaid().render('s10', withInit({ useWidth: 99 }));
    expect(set.svg).toBe(base.svg);
    expect(set.warnings).toEqual([]);
  });

  it('drops colours that fail the colour check with one SANKEY_COLOR_INVALID, drawing the defaults', async () => {
    const m = createMermaid();
    const plain = await m.render('s11', TEXT);
    const bad = await m.render(
      's11',
      withInit({ linkColor: 'url(#x)', nodeColors: { Solar: 'javascript:alert(1)', Gas: 5 } })
    );
    expect(bad.warnings.map((w) => [w.code, w.path])).toEqual([
      [SANKEY_COLOR_INVALID, 'sankey.linkColor'],
    ]);
    expect(bad.warnings[0]!.message).toBe(
      'Not a colour, so the default is drawn instead: sankey.linkColor "url(#x)", sankey.nodeColors.Solar "javascript:alert(1)", sankey.nodeColors.Gas 5'
    );
    expect(bad.svg).toBe(plain.svg);
    // `gradient` is a mode before it is a named colour.
    expect((await m.render('s11', withInit({ linkColor: 'gradient' }))).warnings).toEqual([]);
  });

  it('falls back to the default for an option it cannot use, one SANKEY_CONFIG_INVALID per key', async () => {
    const m = createMermaid();
    const plain = await m.render('s12', TEXT);
    const bad = await m.render(
      's12',
      withInit({ width: 'wide', nodePadding: -5, nodeAlignment: 'middle', showValues: 'yes' })
    );
    expect(bad.warnings.map((w) => [w.code, w.path])).toEqual([
      [SANKEY_CONFIG_INVALID, 'sankey.width'],
      [SANKEY_CONFIG_INVALID, 'sankey.nodePadding'],
      [SANKEY_CONFIG_INVALID, 'sankey.nodeAlignment'],
      [SANKEY_CONFIG_INVALID, 'sankey.showValues'],
    ]);
    expect(bad.warnings[1]!.message).toBe(
      'sankey.nodePadding is -5, not a number of 0 or more; using the default 12'
    );
    expect(bad.svg).toBe(plain.svg);
    // `useMaxWidth` is read as a boolean: `"false"` is the default, with a warning.
    const fit = await m.render('s12', withInit({ useMaxWidth: 'false' }));
    expect(fit.warnings.map((w) => [w.code, w.message])).toEqual([
      [
        SANKEY_CONFIG_INVALID,
        'sankey.useMaxWidth is "false", not true or false; using the default true',
      ],
    ]);
    expect(fit.svg).toBe(plain.svg);
    const notAMap = await m.render('s12', withInit({ nodeColors: 'red' }));
    expect(notAMap.warnings.map((w) => w.message)).toEqual([
      'sankey.nodeColors is "red", not an object of node colours; using none',
    ]);
    expect(notAMap.svg).toBe(plain.svg);
    // A numeric string is its number, as v12's d3 read it.
    const asText = await m.render('s12', withInit({ width: '300' }));
    expect([asText.warnings, asText.width]).toEqual([[], 300]);
  });

  it('applies the node and link limits, and the text cannot raise them (R-SEC-5)', async () => {
    const m = createMermaid();
    m.initialize({ limits: { maxEdges: 2 } });
    const e = await rejection(m.render('s13', TEXT));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('LIMIT');
    const raised = '---\nconfig:\n  limits:\n    maxEdges: 100\n---\n' + TEXT;
    expect(await rejection(m.render('s13', raised))).toBeInstanceOf(MermaidError);
    m.initialize({ limits: { maxEdges: 3, maxNodes: 3 } });
    expect(((await rejection(m.render('s13', TEXT))) as MermaidError).code).toBe('LIMIT');
    m.initialize({ limits: { maxEdges: 3, maxNodes: 4 } });
    expect((await m.render('s13', TEXT)).diagramType).toBe('sankey');
  });

  it('applies a fractional limit as the whole number under it', async () => {
    const m = createMermaid();
    // Three links, four nodes: 2.5 links and 3.5 nodes are both exceeded.
    for (const limits of [{ maxEdges: 2.5 }, { maxNodes: 3.5 }]) {
      m.initialize({ limits });
      const e = await rejection(m.render('s15', TEXT));
      expect(e, JSON.stringify(limits)).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, JSON.stringify(limits)).toBe('LIMIT');
    }
    m.initialize({ limits: { maxEdges: 3.5, maxNodes: 4.5 } });
    expect((await m.render('s15', TEXT)).diagramType).toBe('sankey');
  });

  it('draws each theme apart, and the theme cache keeps them apart (D336)', async () => {
    const m = createMermaid();
    const themed = (theme: string) =>
      m.render('s14', `---\nconfig:\n  theme: ${theme}\n---\n${TEXT}`).then((r) => r.svg);
    const light = await themed('default');
    const dark = await themed('dark');
    expect(dark).not.toBe(light);
    expect(await themed('default')).toBe(light);
    expect(await themed('dark')).toBe(dark);
  });
});
