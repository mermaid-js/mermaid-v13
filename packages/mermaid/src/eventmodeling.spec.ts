import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { eventmodeling } from '@mermaid-js/diagram-eventmodeling';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// Event models are a first-party type (#611): `eventmodeling` goes to
// `@mermaid-js/diagram-eventmodeling` through the generated registry, after block and before
// treeView as in v12, and no longer fails with UNSUPPORTED_DIAGRAM (R-COMPAT-7).
const TEXT = [
  'eventmodeling',
  'tf 01 ui CartScreen',
  'tf 02 cmd AddItem ->> 01 { productId: 7 }',
  'tf 03 evt ItemAdded ->> 02',
  'tf 04 rmo CartItems ->> 03',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withConfig = (body: string, text = TEXT) =>
  `---\nconfig:\n  eventmodeling:\n${body}---\n${text}`;
const viewBox = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
const count = (svg: string, cls: string): number =>
  svg.match(new RegExp(`class="${cls}"`, 'g'))?.length ?? 0;
/** The `x` of each box's rect, in order. */
const boxXs = (svg: string): number[] =>
  [...svg.matchAll(/<g class="em-box"[^>]*><rect[^>]* x="([^"]*)"/g)].map((m) => Number(m[1]));

describe('event models through the public API (#611)', () => {
  it('renders eventmodeling, which was UNSUPPORTED_DIAGRAM before', async () => {
    const m = createMermaid();
    const result = await m.render('t', TEXT);
    expect(result.diagramType).toBe('eventmodeling');
    expect(result.svg).toContain('aria-roledescription="eventmodeling"');
    expect(result.svg).toContain('class="mermaid mermaid-eventmodeling"');
    // v12's bands: UI and automation, commands and read models, events.
    expect(count(result.svg, 'em-swimlane')).toBe(3);
    expect(count(result.svg, 'em-box')).toBe(4);
    expect(count(result.svg, 'em-relation')).toBe(3);
    expect(result.svg).toContain('>AddItem</');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it('keeps v12’s detector pattern and place, after block and before treeView', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('eventmodeling')).toBe(types.indexOf('block') + 1);
    expect(types.indexOf('treeView')).toBe(types.indexOf('eventmodeling') + 1);
    const m = createMermaid();
    expect(m.detectType('  eventmodeling\ntf 01 ui A')).toBe('eventmodeling');
    expect(m.supportsFormat('eventmodeling', 'svg')).toBe(true);
  });

  it('rejects text v12 rejects with SYNTAX, at the line', async () => {
    const e = await rejection(
      createMermaid().render('t', 'eventmodeling\ntf 01 ui A\ntf 0001 evt B\n')
    );
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBe(3);
  });

  it('reports a duplicate frame id as an error, as v12 threw', async () => {
    const e = await rejection(
      createMermaid().render('t', 'eventmodeling\ntf 01 ui A\ntf 01 evt B\n')
    );
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('eventmodeling');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320, R-ASCII-5)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('eventmodeling', 'ascii')).toBe(false);
    const e = await rejection(m.render('t', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('eventmodeling');
  });

  it.each(['sample', 'agree'])(
    'renders the editor %s document as a valid model, with no warning',
    async (name) => {
      const file = new URL(
        `../../diagram-eventmodeling/grammar/eventmodeling.${name}.mmd`,
        import.meta.url
      );
      const r = await createMermaid().render('t', readFileSync(file, 'utf8'));
      expect(r.diagramType).toBe('eventmodeling');
      expect(r.warnings).toEqual([]);
    }
  );

  it('renders through mermaid/slim with the eventmodeling plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [eventmodeling] });
    expect((await slim.render('t', TEXT)).svg).toBe((await createMermaid().render('t', TEXT)).svg);
  });
});

describe('the eventmodeling config section through render() (#611)', () => {
  const m = createMermaid();
  let plain: Awaited<ReturnType<typeof m.render>>;

  beforeAll(async () => {
    plain = await m.render('t', TEXT);
  });

  it('useMaxWidth: on by default, false draws at its own width', async () => {
    expect(plain.svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('t', withConfig('    useMaxWidth: false\n'));
    expect(fixed.warnings).toEqual([]);
    expect(fixed.svg).toMatch(/<svg[^>]* width="\d/);
  });

  it('padding: 30 by default, and the given margin around what is drawn', async () => {
    const [x0, y0, w0, h0] = viewBox(plain.svg);
    const tight = await m.render('t', withConfig('    padding: 8\n'));
    expect(tight.warnings).toEqual([]);
    const [x, y, w, h] = viewBox(tight.svg);
    expect([x! - x0!, y! - y0!, w! - w0!, h! - h0!]).toEqual([22, 22, -44, -44]);
    expect(boxXs(tight.svg)).toEqual(boxXs(plain.svg));
  });

  it('a padding that is not a length draws with 30 and one EVENTMODELING_CONFIG_INVALID', async () => {
    for (const bad of ['-5', '"wide"']) {
      const r = await m.render('t', withConfig(`    padding: ${bad}\n`));
      expect(viewBox(r.svg)).toEqual(viewBox(plain.svg));
      expect(r.warnings.map((w) => [w.code, w.path])).toEqual([
        ['EVENTMODELING_CONFIG_INVALID', 'eventmodeling.padding'],
      ]);
    }
  });

  it('rowHeight and useWidth are accepted and ignored, with no warning (v12 read neither)', async () => {
    const r = await m.render('t', withConfig('    rowHeight: 200\n    useWidth: 50\n'));
    expect(r.warnings).toEqual([]);
    expect(r.svg).toBe(plain.svg);
  });
});
