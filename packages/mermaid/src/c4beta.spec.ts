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
