import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { c4 } from '@mermaid-js/diagram-c4';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The C4 diagram is a first-party type (#542): the five headers go to `@mermaid-js/diagram-c4`
// through the generated registry, fifth as in v12's detector order (after agentflow, before
// kanban), with D451's anchored detector.
const TEXT = [
  'C4Container',
  'title Internet banking',
  'Person(user, "Customer", "A bank customer")',
  'System_Ext(mail, "Mail", "Sends e-mails")',
  'Container_Boundary(bank, "Bank") {',
  '  Container(web, "Web app", "Java", "Serves the pages")',
  '  ContainerDb(db, "Database", "SQL", "Holds accounts")',
  '  ContainerQueue(q, "Queue", "Kafka")',
  '}',
  'Rel(user, web, "Uses", "HTTPS")',
  'Rel(web, db, "Reads")',
  'Rel(web, q, "Publishes")',
  'Rel_Back(mail, web, "Sends via")',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
const count = (svg: string, re: RegExp): number => svg.match(re)?.length ?? 0;
/** The width of an element's outline. */
const width = (svg: string, alias: string): number =>
  Number(
    new RegExp(
      `<g class="node c4-shape [^"]*" data-id="${alias}"[^>]*>\\s*<rect [^>]*width="([\\d.]+)"`
    ).exec(svg)?.[1]
  );

describe('C4 diagrams through the public API (#542)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('c1', TEXT);
    expect(result.diagramType).toBe('c4');
    expect(result.svg).toContain('aria-roledescription="c4"');
    expect(result.svg).toContain('class="mermaid mermaid-c4"');
    expect(count(result.svg, /<g class="node c4-shape /g)).toBe(5);
    expect(count(result.svg, /<g class="c4-boundary"/g)).toBe(1);
    expect(count(result.svg, /<path class="c4-rel /g)).toBe(4);
    expect(result.svg).toContain('>Internet banking</text>');
    expect(result.svg).not.toContain('<style');
    expect(result.svg).not.toContain('<marker');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
    for (const header of ['C4Context', 'C4Component', 'C4Dynamic', 'C4Deployment']) {
      const r = await createMermaid().render('c1', TEXT.replace('C4Container', header));
      expect(r.diagramType, header).toBe('c4');
    }
  });

  it('renders through mermaid/slim, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [c4] });
    expect((await slim.render('c2', TEXT)).svg).toBe(
      (await createMermaid().render('c2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('c4');
  });

  it('keeps v12’s place, after agentflow and before kanban, with D451’s anchored detector', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('c4')).toBe(4);
    expect(types.indexOf('c4')).toBe(types.indexOf('agentflow') + 1);
    expect(types.indexOf('kanban')).toBe(types.indexOf('c4') + 1);
    expect(DETECTORS.find((d) => d.type === 'c4')?.pattern.source).toBe(
      '^\\s*C4(Context|Container|Component|Dynamic|Deployment)\\b'
    );
    const m = createMermaid();
    for (const header of ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'])
      expect(m.detectType(`  ${header}\n  Person(a, "A")`), header).toBe('c4');
    // v12 matched the last four anywhere in the text; now only where the diagram starts.
    expect(m.detectType('flowchart LR\n  A[C4Container] --> B')).toBe('flowchart-v2');
    expect(m.detectType('sequenceDiagram\n  A->>C4Dynamic: hi')).toBe('sequence');
    expect(m.detectType('sequenceDiagram\n  A->>C4Container: hi')).toBe('sequence');
    expect(m.detectType('sequenceDiagram\n  participant C4Context')).toBe('sequence');
    expect(() => m.detectType('C4ContextX\n  Person(a, "A")')).toThrow();
    expect(() => m.detectType('c4context\n  Person(a, "A")')).toThrow();
  });

  it('rejects what v12 rejects, with v12’s message for an unknown relation end (D457)', async () => {
    const m = createMermaid();
    for (const text of [
      'C4Context\nPerson(u, "U"\n',
      'C4Context\nBoundary(b, "B") {\n}\n',
      'C4Context\nPerson(u, "U")\nRel(u, x, "r")\n',
      'C4Context\ndirection TB\nPerson(u, "U")\n',
    ]) {
      const e = await rejection(m.render('c3', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
    const end = await rejection(m.render('c3', 'C4Context\nPerson(u, "U")\nRel(u, x, "r")\n'));
    expect((end as MermaidError).message).toContain(
      'C4 rel "u" -> "x" references an unknown shape or boundary'
    );
    const e = await rejection(m.render('c3', 'C4ContextX\nPerson(u, "U")\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('honours the c4 section over its generated defaults (D454)', async () => {
    const m = createMermaid();
    const body = 'C4Context\nSystem(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nSystem(d, "D")\n';
    const plain = await m.render('c4', body);
    const same = await m.render(
      'c4',
      '%%{init: {"c4": {"c4ShapeInRow": 4, "diagramMarginX": 50, "width": 216}}}%%\n' + body
    );
    expect(same.svg).toBe(plain.svg);
    // Two in a row: narrower and taller.
    const two = await m.render('c4', '%%{init: {"c4": {"c4ShapeInRow": 2}}}%%\n' + body);
    const [, , w4, h4] = box(plain.svg)!.split(' ').map(Number);
    const [, , w2, h2] = box(two.svg)!.split(' ').map(Number);
    expect(w2).toBeLessThan(w4!);
    expect(h2).toBeGreaterThan(h4!);
    // `UpdateLayoutConfig` beats the config default.
    const back = await m.render(
      'c4',
      '%%{init: {"c4": {"c4ShapeInRow": 2}}}%%\n' + body + 'UpdateLayoutConfig($c4ShapeInRow="4")\n'
    );
    expect(box(back.svg)).toBe(box(plain.svg));
    const wide = await m.render('c4', '%%{init: {"c4": {"width": 300}}}%%\n' + body);
    expect(width(wide.svg, 'a')).toBe(300);
    expect(width(plain.svg, 'a')).toBe(216);
    m.initialize({ c4: { width: 300 } });
    expect((await m.render('c4', body)).svg).toBe(wide.svg);
  });

  it('honours c4.useMaxWidth: false draws the diagram at its own size', async () => {
    const m = createMermaid();
    const plain = (await m.render('c5', TEXT)).svg;
    expect(plain).toMatch(/<svg [^>]*width="100%"/);
    expect(plain).toContain('max-width:');
    const fixed = (
      await m.render('c5', '---\nconfig:\n  c4:\n    useMaxWidth: false\n---\n' + TEXT)
    ).svg;
    const [, , w, h] = box(fixed)!.split(' ');
    expect(fixed).toMatch(new RegExp(`<svg [^>]*width="${w}" height="${h}"`));
    expect(fixed).not.toContain('max-width');
  });

  it('draws the config palette, a refused colour as the default with one warning (R-SEC-2)', async () => {
    const m = createMermaid();
    const body = 'C4Context\nPerson(u, "U")\n';
    const plain = await m.render('c6', body);
    expect(plain.svg).toContain('fill="#08427B"');
    const red = await m.render('c6', '%%{init: {"c4": {"person_bg_color": "#ff0000"}}}%%\n' + body);
    expect(red.svg).toContain('fill="#ff0000"');
    const bad = await m.render('c6', '%%{init: {"c4": {"person_bg_color": "red;x"}}}%%\n' + body);
    expect(bad.svg).toBe(plain.svg);
    expect(bad.warnings.map((w) => w.code)).toEqual(['C4_COLOR_INVALID']);
  });

  it('takes the theme’s fontFamily for a font family left unset, and a set one', async () => {
    const m = createMermaid();
    const body = 'C4Context\nPerson(u, "U")\n';
    const plain = (await m.render('c7', body)).svg;
    expect(plain).not.toContain('Open Sans');
    const set = (
      await m.render('c7', '%%{init: {"c4": {"personFontFamily": "Courier"}}}%%\n' + body)
    ).svg;
    expect(set).toContain('font-family="Courier"');
  });

  it('takes c4.theme over the top-level theme', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'default' });
    const dark = await m.render('c8', '---\nconfig:\n  theme: dark\n---\n' + TEXT);
    const scoped = await m.render('c8', '%%{init: {"c4": {"theme": "dark"}}}%%\n' + TEXT);
    expect(scoped.svg).toBe(dark.svg);
    expect(scoped.svg).not.toBe((await m.render('c8', TEXT)).svg);
  });

  it('ignores c4.height, boxMargin, wrapPadding, useWidth and layout (D454), and warns LOOK_REMOVED for c4.look', async () => {
    const m = createMermaid();
    const base = await m.render('c9', TEXT);
    for (const init of [
      '{"c4": {"height": 400}}',
      '{"c4": {"boxMargin": 99}}',
      '{"c4": {"wrapPadding": 99}}',
      '{"c4": {"useWidth": 99}}',
      '{"c4": {"layout": "elk"}}',
      '{"layout": "dagre"}',
    ]) {
      const r = await m.render('c9', `%%{init: ${init}}%%\n` + TEXT);
      expect(r.svg, init).toBe(base.svg);
      expect(r.warnings, init).toEqual([]);
    }
    const look = await m.render('c9', '%%{init: {"c4": {"look": "neo"}}}%%\n' + TEXT);
    expect(look.svg).toBe(base.svg);
    expect(look.warnings.map((w) => w.code)).toEqual(['LOOK_REMOVED']);
  });

  it('draws the front-matter title where the text has none, and accTitle as the accessible name only (D453)', async () => {
    const m = createMermaid();
    const person = 'Person(u, "U")\n';
    const fm = (await m.render('c10', `---\ntitle: From front matter\n---\nC4Context\n${person}`))
      .svg;
    expect(fm).toContain('>From front matter</text>');
    const both = (
      await m.render(
        'c10',
        `---\ntitle: From front matter\n---\nC4Context\ntitle   In text  \n${person}`
      )
    ).svg;
    expect(both).toContain('>In text</text>');
    expect(both).not.toContain('From front matter');
    const acc = (await m.render('c10', `C4Context\naccTitle: Accessible\n${person}`)).svg;
    expect(acc).toContain('<title id="c10-title">Accessible</title>');
    expect(acc).not.toContain('class="c4-title"');
  });

  it('reports svg and ascii, and draws nothing as text in an SVG render (R-ASCII-5)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('c4', 'svg')).toBe(true);
    expect(m.supportsFormat('c4', 'ascii')).toBe(true);
    const svg = await m.render('c11', TEXT);
    expect(svg.svg).toContain('aria-roledescription="c4"');
  });
});

// #545 (D459): text output draws the SVG's grid on a character grid: boxes with `[Kind]`,
// boundaries as dashed frames with the label in the top border, stepped relations with the
// label at the middle and arrowheads.
const LOOP = [
  'C4Context',
  'Person(a, "Alice")',
  'System(b, "Billing system with a long name", "Takes the money")',
  'Rel(a, b, "Pays")',
  'Rel(b, b, "Retries")',
].join('\n');

const BOUNDARY = [
  'C4Context',
  'title Payments',
  'Person(a, "Alice")',
  'System_Boundary(bank, "Bank") {',
  '  SystemDb(db, "Ledger", "Holds the balances")',
  '}',
  'Rel(a, db, "Pays", "HTTPS")',
].join('\n');

describe('C4 text output (#545, D459)', () => {
  it('draws boxes, stepped relations, arrowheads and a self-loop in Unicode', async () => {
    const r = await createMermaid().render('a1', LOOP, { format: 'ascii' });
    expect(r.text).toBe(
      [
        '╭─────────────────────────╮             ╭─────────────────────────╮',
        '│                         │             │  Billing system with a  │',
        '│                         │             │        long name        ├─┐',
        '│          Alice          ├─── Pays ───►│    [Software System]    │ Retries',
        '│        [Person]         │             │     Takes the money     │◄┘',
        '╰─────────────────────────╯             │                         │',
        '                                        ╰─────────────────────────╯',
      ].join('\n')
    );
    expect(r).toMatchObject({ format: 'ascii', columns: 75, rows: 7, diagramType: 'c4' });
    expect(r.warnings).toEqual([]);
  });

  it('draws a boundary as a dashed frame with its label in the top border, in both charsets', async () => {
    const m = createMermaid();
    const unicode = await m.render('a2', BOUNDARY, { format: 'ascii' });
    const lines = unicode.text.split('\n');
    expect(lines[0]).toBe('                Payments');
    // The line steps round the frame's label and its `[type]`, never under them.
    expect(lines).toContain('┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┼┄ Bank ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐');
    expect(lines).toContain('┆        Pays   [SYSTEM]               ┆');
    expect(lines).toContain('┆      ╒═════════════════════════╕     ┆');
    expect(unicode.text).toContain('Pays');
    expect(unicode.text).toContain('[HTTPS]');
    const ascii = await m.render('a3', BOUNDARY, { format: 'ascii', ascii: { charset: 'ascii' } });
    expect(ascii.text).toBe(
      [
        '                Payments',
        '',
        '+-------------------------+',
        '|                         |',
        '|                         |',
        '|          Alice          |',
        '|        [Person]         |',
        '|                         |',
        '+----------------+--------+',
        '                 |',
        '                 |',
        '               +-+',
        '+..............+. Bank ................+',
        ':        Pays   [SYSTEM]               :',
        ':       [HTTPS]                        :',
        ':              |                       :',
        ':              +-+                     :',
        ':                v                     :',
        ':      +=========================+     :',
        ':      |                         |     :',
        ':      |                         |     :',
        ':      |         Ledger          |     :',
        ':      |    [Software System]    |     :',
        ':      |   Holds the balances    |     :',
        ':      |                         |     :',
        ':      +=========================+     :',
        ':                                      :',
        ':                                      :',
        '+......................................+',
      ].join('\n')
    );
    expect(ascii.text).not.toMatch(/[─-╿…]/u);
  });

  it('renders synchronously once prepared for text', async () => {
    const m = createMermaid();
    await m.prepare(LOOP, { format: 'ascii' });
    const sync = m.renderSync(LOOP, { format: 'ascii' });
    expect(sync.text).toBe((await m.render('a4', LOOP, { format: 'ascii' })).text);
  });

  it('is never cropped: ASCII_TOO_WIDE when it does not fit ascii.maxWidth (R-ASCII-8)', async () => {
    const m = createMermaid();
    const wide = await m.render('a5', LOOP, { format: 'ascii', ascii: { maxWidth: 30 } });
    expect(wide.columns).toBe(75);
    expect(wide.text).toBe((await m.render('a6', LOOP, { format: 'ascii' })).text);
    expect(wide.warnings.map((w) => w.code)).toEqual(['ASCII_TOO_WIDE']);
    expect(wide.warnings[0]!.message).toContain('ascii.maxWidth is 30');
    const fits = await m.render('a7', LOOP, { format: 'ascii', ascii: { maxWidth: 75 } });
    expect(fits.warnings).toEqual([]);
  });

  it('warns once per feature it drops; config colours and fonts not at all (D459, D82)', async () => {
    const text = [
      'C4Context',
      'accTitle: Payments',
      'Person(a, "Alice")',
      'System(b, "Bank")',
      'System(c, "Ledger")',
      'Rel(a, b, "Pays", "HTTPS", "Card payments")',
      'Rel(b, c, "Books")',
      'UpdateElementStyle(a, $bgColor="red")',
      'UpdateRelStyle(a, b, $lineColor="blue", $offsetX="10")',
      'UpdateRelStyle(b, c, $offsetY="-5")',
    ].join('\n');
    const m = createMermaid();
    const r = await m.render('a8', text, {
      format: 'ascii',
      config: { c4: { person_bg_color: '#ff0000', personFontSize: 30 } },
    });
    const dropped = r.warnings.filter((w) => w.code === 'ASCII_DROPPED');
    expect(dropped.map((w) => [w.feature, w.astIds])).toEqual([
      ['style', ['element:a', 'rel:a->b']],
      ['offset', ['rel:a->b', 'rel:b->c']],
      ['tooltip', ['rel:a->b']],
      ['accessibility', []],
    ]);
    expect(r.warnings).toHaveLength(4);
    // The SVG draws all of it: none of these warnings there.
    const svg = await m.render('a9', text);
    expect(svg.warnings.filter((w) => w.code === 'ASCII_DROPPED')).toEqual([]);
  });

  it('raises a padding or margin with no room for a border, with C4_CONFIG_IGNORED (pitfall 22)', async () => {
    const m = createMermaid();
    const config = { c4: { c4ShapePadding: 0, c4ShapeMargin: 4 } };
    const r = await m.render('a10', LOOP, { format: 'ascii', config });
    expect(r.warnings.map((w) => [w.code, w.path])).toEqual([
      ['C4_CONFIG_IGNORED', 'c4.c4ShapePadding'],
      ['C4_CONFIG_IGNORED', 'c4.c4ShapeMargin'],
    ]);
    expect(r.text).toContain('Alice');
    expect(r.text).toContain('Billing system with a');
    const svg = await m.render('a11', LOOP, { config });
    expect(svg.warnings).toEqual([]);
  });

  it('adds a row round each element’s text with ascii.padding: roomy', async () => {
    const m = createMermaid();
    const compact = await m.render('a12', LOOP, { format: 'ascii' });
    const roomy = await m.render('a13', LOOP, { format: 'ascii', ascii: { padding: 'roomy' } });
    expect(roomy.rows).toBeGreaterThan(compact.rows);
    expect(roomy.warnings).toEqual([]);
  });
});
