import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';

// c4-beta is the second header type of the `c4` plugin (spec #730): detected, routed, laid out by
// core's `layered` engine and drawn with C4's painters.
const FIXTURES = join(import.meta.dirname, '../../../e2e/diagrams/c4beta/pr-check');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

/** Every `<text>` of `svg` with its `<tspan>`s joined, so a wrapped label matches as one string. */
function texts(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    m[1]!
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );
}

describe('c4-beta through the public API (spec #730)', () => {
  it('draws every name, boundary header and relation label of a nested diagram', async () => {
    const src = fixture('nested-boundaries.mmd');
    const r = await createMermaid().render('c1', src);
    expect(r.diagramType).toBe('c4beta');
    expect(r.svg).toContain('class="mermaid mermaid-c4beta"');
    expect(r.svg).toContain('aria-roledescription="c4beta"');
    expect(r.warnings).toEqual([]);
    const all = texts(r.svg).join('\n');
    for (const part of [
      'Internet Banking - Containers',
      'Personal Customer',
      'Single-Page App',
      'API Application',
      'Database',
      'Mainframe Banking',
      'Internet Banking',
      'Web tier',
      'Uses',
      '[HTTPS]',
      'Calls',
      'Reads and writes',
      '[SQL]',
      'Reads accounts from',
    ])
      expect(all, part).toContain(part);
    expect(r.svg.match(/<g class="c4-boundary"/g)).toHaveLength(2);
    expect(r.svg.match(/<g class="node c4-shape /g)).toHaveLength(5);
    expect(r.svg.match(/<path class="c4-rel /g)).toHaveLength(4);
    assertInert(r.svg);
  });

  it('numbers the steps of a dynamic diagram', async () => {
    const r = await createMermaid().render('c1', fixture('dynamic-steps.mmd'));
    const all = texts(r.svg);
    for (const step of [
      '1. Enters credentials',
      '3. Looks up the user',
      '5. Returns a session token',
    ])
      expect(all).toContain(step);
  });

  it('renders every fixture, with the warnings the spec expects and no others', async () => {
    const expected: Record<string, string[]> = {
      'b08-style-values.mmd': ['C4BETA_STYLE_IGNORED'],
      'b21-tech-on-person.mmd': ['C4BETA_TECHNOLOGY_DROPPED', 'C4BETA_INSTANCES_DROPPED'],
      'b25-step-outside-dynamic.mmd': ['C4BETA_STEP_IGNORED'],
      'markup-and-quotes-in-every-text.mmd': ['C4_COLOR_INVALID', 'HTML_DROPPED'],
    };
    const m = createMermaid();
    const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.mmd'));
    expect(files.length).toBeGreaterThanOrEqual(19);
    for (const f of files) {
      const r = await m.render('c1', fixture(f));
      expect(r.diagramType, f).toBe('c4beta');
      expect(r.warnings.map((w) => w.code).sort(), f).toEqual((expected[f] ?? []).sort());
      assertInert(r.svg);
    }
  });

  it('gives N errors N diagnostics, with positions, and no SVG', async () => {
    const text = 'c4-beta context\nperson p "P"\nperson\nsoftwareSystem s "S"\ncontainer c\n';
    const e = await rejection(createMermaid().render('c1', text));
    expect(e).toBeInstanceOf(MermaidError);
    const diagnostics = (e as MermaidError).diagnostics;
    expect(diagnostics.map((d) => d.range.start)).toEqual([
      text.indexOf('\n', text.indexOf('person\n')),
      text.indexOf('\n', text.indexOf('container c')),
    ]);
  });

  it('reports the unsupported-format error for text output', async () => {
    const e = await rejection(
      createMermaid().render('c1', fixture('b02-basic-context.mmd'), { format: 'ascii' })
    );
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('c4beta');
    expect((e as UnsupportedFormatError).format).toBe('ascii');
  });

  it('writes markup and quotes in every text as text, and refuses a colour that is not one', async () => {
    const r = await createMermaid().render('c1', fixture('markup-and-quotes-in-every-text.mmd'));
    assertInert(r.svg);
    expect(r.svg).not.toMatch(/<(script|img|a)\b|<[^>]*\son\w+=|<[^>]*href=/i);
    expect(r.svg.match(/<svg\b/g)).toHaveLength(1);
    const all = texts(r.svg).join('\n');
    for (const part of [
      '"Title" & \'more\'',
      'Says "hi" & \'bye\'',
      'Serves </text><text>orders',
      '"now"',
      "[HTTPS & 'TLS']",
    ])
      expect(all, part).toContain(part);
    expect(r.svg).toContain('&lt;b onmouseover=&quot;x()&quot;&gt;Acc&lt;/b&gt;');
    expect(r.svg).toContain('&lt;/desc&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(r.svg).toMatch(/c4-person"[^>]*><rect [^>]*fill="#08427B"/);
  });

  it('keeps ids unique and writes none but the accessible title and description', async () => {
    const r = await createMermaid().render('c1', fixture('b34-accdescr-block.mmd'));
    const ids = [...r.svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /-(title|desc)$/.test(id!))).toBe(true);
  });

  it('keeps legacy C4 on its own type', async () => {
    const r = await createMermaid().render('c1', 'C4Context\nPerson(a, "A")\n');
    expect(r.diagramType).toBe('c4');
    expect(r.svg).toContain('aria-roledescription="c4"');
  });
});

// Until c4-beta draws text (spec #730 T7), it has no text output in every place a type without
// one is asked for it, as `classDiagram` has none; legacy C4 keeps its own.
describe('c4-beta without text output (spec #730 T0)', () => {
  it('says so through supportsFormat, while legacy C4 keeps ascii', () => {
    const m = createMermaid();
    expect(m.supportsFormat('c4beta', 'ascii')).toBe(false);
    expect(m.supportsFormat('c4beta', 'svg')).toBe(true);
    expect(m.supportsFormat('c4', 'ascii')).toBe(true);
  });

  it('throws UnsupportedFormatError from prepare, before renderSync', async () => {
    const e = await rejection(
      createMermaid().prepare(fixture('b02-basic-context.mmd'), { format: 'ascii' })
    );
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('c4beta');
  });

  it('gives UNSUPPORTED_FORMAT, not a syntax error, for a broken source', async () => {
    const e = await rejection(
      createMermaid().render('c1', 'c4-beta\nperson\n', { format: 'ascii' })
    );
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as MermaidError).code).toBe('UNSUPPORTED_FORMAT');
  });

  it('throws from preload for ascii', async () => {
    const e = await rejection(createMermaid().preload({ types: ['c4beta'], formats: ['ascii'] }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
  });

  it('draws a block embedded in a flowchart as a stand-in frame with one warning', async () => {
    const text = [
      'flowchart TB',
      '  A --> model',
      '  mermaid model["Context"] {',
      '    c4-beta context',
      '      person a "A"',
      '  }',
    ].join('\n');
    const m = createMermaid();
    await m.prepare(text, { format: 'ascii' });
    const out = m.renderSync(text, { format: 'ascii' });
    expect(out.text).toMatch(/│ +\[c4beta\] +│/);
    expect(out.warnings).toEqual([
      expect.objectContaining({ code: 'ASCII_DROPPED', feature: 'embed' }),
    ]);
  });
});

// c4-beta is laid out by core's `layered` engine whatever `layout` says (spec #730, Q2).
describe('c4-beta and the layout setting (spec #730)', () => {
  const body = 'c4-beta\nperson a "A"\nsoftwareSystem s "S"\na --> s\n';
  const codes = async (text: string) =>
    (await createMermaid().render('c1', text)).warnings.map((w) => w.code);

  it('warns once for a layout it does not use, from a directive or front matter', async () => {
    expect(await codes(`%%{init: {"layout": "elk"}}%%\n${body}`)).toEqual([
      'C4BETA_LAYOUT_IGNORED',
    ]);
    expect(await codes(`---\nconfig:\n  layout: tree\n---\n${body}`)).toEqual([
      'C4BETA_LAYOUT_IGNORED',
    ]);
  });

  it('says nothing for layered, dagre or no layout, and draws the same diagram', async () => {
    const plain = await createMermaid().render('c1', body);
    expect(plain.warnings).toEqual([]);
    for (const layout of ['layered', 'dagre', 'elk']) {
      const r = await createMermaid().render('c1', `%%{init: {"layout": "${layout}"}}%%\n${body}`);
      expect(r.warnings.length, layout).toBe(layout === 'elk' ? 1 : 0);
      expect(r.svg, layout).toBe(plain.svg);
    }
  });

  it('leaves legacy C4 as it was', async () => {
    expect(await codes('%%{init: {"layout": "elk"}}%%\nC4Context\nPerson(a, "A")\n')).toEqual([]);
  });
});

// The detector reads leading whitespace as regex `\s` does (a byte-order mark, a no-break space
// included), so the c4-beta parser skips the same before its header, as legacy C4's does.
describe('c4-beta after leading Unicode whitespace (spec #730)', () => {
  it.each([
    ['a byte-order mark', '﻿'],
    ['a no-break space', ' '],
    ['both, and a line break', '﻿\n  '],
  ])('renders after %s, as legacy C4 does', async (_, lead) => {
    const m = createMermaid();
    const beta = await m.render('c1', `${lead}c4-beta\nperson a "A"\n`);
    expect(beta.diagramType).toBe('c4beta');
    expect(beta.svg).toBe((await m.render('c1', 'c4-beta\nperson a "A"\n')).svg);
    expect((await m.render('c1', `${lead}C4Context\nPerson(a, "A")\n`)).diagramType).toBe('c4');
  });
});
