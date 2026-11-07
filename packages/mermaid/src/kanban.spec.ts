import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { kanban } from '@mermaid-js/diagram-kanban';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The kanban board is a first-party type (#459): `kanban` goes to `@mermaid-js/diagram-kanban`
// through the generated registry, between c4 and classDiagram as in v12's detector order.
const TEXT = [
  'kanban',
  '  todo[Todo]',
  '    docs[Write the docs]@{ ticket: MC-1, assigned: knsv, priority: High }',
  '    blog[Blog post]',
  '  done[Done]',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const box = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
const links = (svg: string): string[] =>
  [...svg.matchAll(/<a class="kanban-ticket-link" href="([^"]*)"/g)].map((m) => m[1]!);
const columnWidth = (svg: string): number =>
  Number(/<g class="cluster section-1"[^>]*><rect [^>]* width="([\d.]+)"/.exec(svg)?.[1]);

describe('kanban boards through the public API (#459)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const m = createMermaid();
    const result = await m.render('k1', TEXT);
    expect(result.diagramType).toBe('kanban');
    expect(result.svg).toContain('aria-roledescription="kanban"');
    expect(result.svg).toContain('class="mermaid mermaid-kanban"');
    expect(result.svg.match(/<g class="cluster section-\d+"/g)).toHaveLength(2);
    expect(result.svg.match(/<g class="node"/g)).toHaveLength(2);
    expect(result.svg).toContain('class="kanban-priority"');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim with the plugin passed in, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [kanban] });
    expect((await slim.render('k2', TEXT)).svg).toBe(
      (await createMermaid().render('k2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('kanban');
  });

  it('keeps v12’s detector pattern and place, after c4 and before classDiagram', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('kanban')).toBe(types.indexOf('c4') + 1);
    expect(types.indexOf('classDiagram')).toBe(types.indexOf('kanban') + 1);
    const m = createMermaid();
    // Case-sensitive, with no word boundary, as v12's `/^\s*kanban/`.
    expect(m.detectType('  kanban\n  todo')).toBe('kanban');
    expect(m.detectType('kanbanBoard\n  todo')).toBe('kanban');
    expect(m.detectType('kanbanx\n  todo')).toBe('kanban');
    expect(() => m.detectType('Kanban\n  todo')).toThrow();
    expect(() => m.detectType('KANBAN\n  todo')).toThrow();
  });

  it('rejects a header the detector takes but the grammar does not, as v12 does', async () => {
    const m = createMermaid();
    for (const header of ['kanbanBoard', 'kanbanx']) {
      const e = await rejection(m.render('k9', `${header}\n  todo\n`));
      expect(e, header).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, header).toBe('SYNTAX');
    }
    for (const header of ['Kanban', 'KANBAN']) {
      const e = await rejection(m.render('k9', `${header}\n  todo\n`));
      expect(e, header).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, header).toBe('UNSUPPORTED_DIAGRAM');
    }
  });

  it('rejects what v12 rejects', async () => {
    const e = await rejection(createMermaid().render('k3', 'kanban\n  a[x\n  b[y\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
  });

  it('honours the kanban config section over its generated defaults (D378)', async () => {
    const m = createMermaid();
    const plain = await m.render('k4', TEXT);
    expect(columnWidth(plain.svg)).toBe(200);
    expect(links(plain.svg)).toEqual([]);
    // `padding` is the margin round the board.
    const padded = await m.render('k4', '%%{init: {"kanban": {"padding": 20}}}%%\n' + TEXT);
    expect(box(padded.svg)[2]! - box(plain.svg)[2]!).toBe(24);
    // v12 read `mindmap.padding`, `mindmap.useMaxWidth` and `mindmap.maxNodeWidth` for kanban;
    // v13 reads none of them.
    const mindmap =
      '%%{init: {"mindmap": {"padding": 50, "useMaxWidth": false, "maxNodeWidth": 30}}}%%\n';
    expect((await m.render('k4', mindmap + TEXT)).svg).toBe(plain.svg);
    const fm = [
      '---',
      'config:',
      '  kanban:',
      '    sectionWidth: 300',
      '    useMaxWidth: false',
      "    ticketBaseUrl: 'https://tickets.example/browse/#TICKET#'",
      '---',
      TEXT,
    ].join('\n');
    const svg = (await m.render('k4', fm)).svg;
    expect(columnWidth(svg)).toBe(300);
    expect(links(svg)).toEqual(['https://tickets.example/browse/MC-1']);
    expect(svg).toMatch(/<svg [^>]*width="\d+" height="\d+"/);
    expect(svg).not.toContain('max-width');
  });

  it('ignores kanban.useWidth, which v12’s kanban never read', async () => {
    const base = await createMermaid().render('k10', TEXT);
    const set = await createMermaid().render(
      'k10',
      '%%{init: {"kanban": {"useWidth": 99}}}%%\n' + TEXT
    );
    expect(set.svg).toBe(base.svg);
    expect(set.warnings).toEqual([]);
  });

  it('takes kanban.theme over the top-level theme', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'default' });
    const dark = await createMermaid().render('k11', '---\nconfig:\n  theme: dark\n---\n' + TEXT);
    const scoped = await m.render('k11', '---\nconfig:\n  kanban:\n    theme: dark\n---\n' + TEXT);
    expect(scoped.svg).toBe(dark.svg);
    expect(scoped.svg).not.toBe((await m.render('k11', TEXT)).svg);
  });

  it('refuses a ticket link the link check refuses, drawing the ticket as text (D377)', async () => {
    const m = createMermaid();
    m.initialize({ kanban: { ticketBaseUrl: 'javascript:alert(#TICKET#)' } });
    const result = await m.render('k5', TEXT);
    expect(links(result.svg)).toEqual([]);
    expect(result.svg).toContain('MC-1');
    expect(result.warnings.map((w) => w.code)).toEqual(['URL_REFUSED']);
    assertInert(result.svg);
  });

  it('warns once for a priority it does not draw (D375)', async () => {
    const text = 'kanban\n  todo\n    a@{ priority: Urgent }\n    b@{ priority: Medium }\n';
    const result = await createMermaid().render('k6', text);
    expect(result.warnings.map((w) => w.code)).toEqual(['KANBAN_PRIORITY']);
    expect(result.svg).not.toContain('kanban-priority');
  });

  it('applies the node limit to columns and cards, and the text cannot raise it', async () => {
    const m = createMermaid();
    m.initialize({ limits: { maxNodes: 3 } });
    const e = await rejection(m.render('k7', TEXT));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('LIMIT');
    const raised = '---\nconfig:\n  limits:\n    maxNodes: 100\n---\n' + TEXT;
    expect(await rejection(m.render('k7', raised))).toBeInstanceOf(MermaidError);
    m.initialize({ limits: { maxNodes: 4 } });
    expect((await m.render('k7', TEXT)).diagramType).toBe('kanban');
  });

  it('draws as text (#466): columns side by side, cards stacked, the priority in the left edge', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('kanban', 'svg')).toBe(true);
    expect(m.supportsFormat('kanban', 'ascii')).toBe(true);
    const result = await m.render('k8', TEXT, { format: 'ascii' });
    expect(result.format).toBe('ascii');
    expect(result.diagramType).toBe('kanban');
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe(
      [
        '┌──────── Todo ─────────┐ ┌──────── Done ─────────┐',
        '│ ┎───────────────────┐ │ │                       │',
        '│ ┃ Write the docs    │ │ └───────────────────────┘',
        '│ ┃ MC-1         knsv │ │',
        '│ ┖───────────────────┘ │',
        '│ ┌───────────────────┐ │',
        '│ │ Blog post         │ │',
        '│ └───────────────────┘ │',
        '└───────────────────────┘',
      ].join('\n')
    );
    expect([result.columns, result.rows]).toEqual([51, 9]);
  });

  it('tags the priority on the card in the ascii charset, and stacks a ticket and assignee that do not fit side by side', async () => {
    const text = [
      'kanban',
      '  doing[Doing]',
      "    a[Fix the login bug]@{ priority: 'Very High' }",
      "    b[Tidy]@{ priority: 'Low', ticket: MC-2037, assigned: 'K.Sveidqvist' }",
    ].join('\n');
    const result = await createMermaid().render('k9', text, {
      format: 'ascii',
      ascii: { charset: 'ascii' },
    });
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe(
      [
        '+-------- Doing --------+',
        '| +-[!!]--------------+ |',
        '| I Fix the login bug | |',
        '| +-------------------+ |',
        '| +-[-]---------------+ |',
        '| : Tidy              | |',
        '| : MC-2037           | |',
        '| :      K.Sveidqvist | |',
        '| +-------------------+ |',
        '+-----------------------+',
      ].join('\n')
    );
  });

  it('right-aligns each line of a wrapped assignee', async () => {
    const text = [
      'kanban',
      '  todo[Todo]',
      "    a[Conquer]@{ assigned: 'Alexander the Great of Macedon' }",
    ];
    const result = await createMermaid().render('k11', text.join('\n'), { format: 'ascii' });
    expect(result.text).toBe(
      [
        '┌──────── Todo ─────────┐',
        '│ ┌───────────────────┐ │',
        '│ │ Conquer           │ │',
        '│ │     Alexander the │ │',
        '│ │  Great of Macedon │ │',
        '│ └───────────────────┘ │',
        '└───────────────────────┘',
      ].join('\n')
    );
  });

  it('drops a ticket link only where the SVG draws one: a refused URL is plain text in both', async () => {
    const text = [
      '---',
      'config:',
      '  kanban:',
      "    ticketBaseUrl: 'javascript:alert(#TICKET#)'",
      '---',
      'kanban',
      '  todo[Todo]',
      '    a[Docs]@{ ticket: MC-1 }',
    ].join('\n');
    const m = createMermaid();
    expect((await m.render('k12', text)).warnings.map((w) => w.code)).toEqual(['URL_REFUSED']);
    expect((await m.render('k12', text, { format: 'ascii' })).warnings).toEqual([]);
  });

  it('warns for what text cannot show, and when the board is wider than ascii.maxWidth (not folded)', async () => {
    const text = [
      '---',
      'config:',
      '  kanban:',
      "    ticketBaseUrl: 'https://example.com/#TICKET#'",
      '---',
      'kanban',
      '  todo[**Todo**]',
      "    a[Docs]@{ ticket: MC-1, priority: 'Urgent' }",
      '  done[Done]',
      '  :::urgent',
    ].join('\n');
    const result = await createMermaid().render('k10', text, {
      format: 'ascii',
      ascii: { maxWidth: 30 },
    });
    expect(result.columns).toBe(51);
    expect(result.text.split('\n')[0]).toBe('┌──────── Todo ─────────┐ ┌──────── Done ─────────┐');
    expect(result.warnings.map((w) => [w.code, (w as { feature?: string }).feature])).toEqual([
      ['KANBAN_PRIORITY', undefined],
      ['ASCII_DROPPED', 'style'],
      ['ASCII_DROPPED', 'emphasis'],
      ['ASCII_DROPPED', 'link'],
      ['ASCII_TOO_WIDE', undefined],
    ]);
    expect(result.warnings.slice(1, 4).map((w) => w.astIds)).toEqual([
      ['n:done'],
      ['n:todo'],
      ['n:a'],
    ]);
  });
});
