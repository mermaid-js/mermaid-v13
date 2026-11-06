import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { packet } from '@mermaid-js/diagram-packet';
import { createMermaid, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The packet diagram is a first-party type (#462): `packet` and `packet-beta` go to
// `@mermaid-js/diagram-packet` through the generated registry, after `sankey` as in v12's
// detector order.
const TEXT = [
  'packet',
  '  title UDP',
  '  0-15: "Source Port"',
  '  16-31: "Destination Port"',
  '  +16: "Length"',
  '  +16: "Checksum"',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const blocks = (svg: string): number => svg.match(/class="packetBlock"/g)?.length ?? 0;
const viewBox = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];

describe('packet diagrams through the public API (#462)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const m = createMermaid();
    const result = await m.render('k1', TEXT);
    expect(result.diagramType).toBe('packet');
    expect(result.svg).toContain('aria-roledescription="packet"');
    expect(result.svg).toContain('class="mermaid mermaid-packet"');
    expect(blocks(result.svg)).toBe(4);
    expect(result.svg).toContain('data-ast="field:32-47"');
    expect(result.svg.match(/class="packetTitle"/g)).toHaveLength(1);
    expect(result.svg).toContain('>UDP<');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim with the plugin passed in, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [packet] });
    expect((await slim.render('k2', TEXT)).svg).toBe(
      (await createMermaid().render('k2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('packet');
  });

  it('keeps v12’s detector pattern and place, after sankey', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('packet')).toBe(types.indexOf('sankey') + 1);
    const m = createMermaid();
    expect(m.detectType('  packet-beta\n0: "a"')).toBe('packet');
    expect(m.detectType('packet\n0: "a"')).toBe('packet');
  });

  it('honours the packet config section over its generated defaults', async () => {
    const m = createMermaid();
    const two = 'packet\n0-63: "a"\n';
    const bySvg = async (text: string): Promise<string> => (await m.render('k3', text)).svg;
    const plain = await bySvg(two);
    expect(blocks(plain)).toBe(2);
    // v12's canvas is bitWidth · bitsPerRow + 2 wide, whatever the rows.
    expect(viewBox(plain)?.split(' ')[2]).toBe('1026');
    const wide = await bySvg('%%{init: {"packet": {"bitsPerRow": 64, "bitWidth": 16}}}%%\n' + two);
    expect(blocks(wide)).toBe(1);
    expect(viewBox(wide)?.split(' ')[2]).toBe('1026');
    const bare = await bySvg('%%{init: {"packet": {"showBits": false}}}%%\n' + two);
    expect(bare).not.toContain('packetByte');
  });

  it('takes a nested themeVariables.packet colour, and the flat name over it (D335, D540)', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'dark', themeVariables: { packet: { blockFillColor: '#123456' } } });
    expect((await m.render('k4', TEXT)).svg).toContain('#123456');
    m.initialize({
      theme: 'redux',
      themeVariables: { packetBlockFillColor: '#654321', packet: { blockFillColor: '#123456' } },
    });
    const svg = (await m.render('k4', TEXT)).svg;
    expect(svg).toContain('#654321');
    expect(svg).not.toContain('#123456');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (#464 is separate)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('packet', 'svg')).toBe(true);
    expect(m.supportsFormat('packet', 'ascii')).toBe(false);
    const e = await rejection(m.render('k5', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('packet');
  });
});
