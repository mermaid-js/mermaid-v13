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

  describe('the c4beta config section (T1)', () => {
    const configFixture = (name: string): string => fixture(`config-${name}`);
    /** `source` with a front matter `config` of `lines` (two-space indented under `config:`). */
    const withConfig = (source: string, lines: string): string =>
      `---\nconfig:\n${lines}\n---\n${source}`;
    const BODY = fixture('b02-basic-context.mmd');
    const size = (svg: string): [number, number] => {
      const [, , w, h] = /viewBox="([^"]*)"/.exec(svg)![1]!.split(' ').map(Number);
      return [w!, h!];
    };
    const padded = async (value: string): Promise<[number, number]> =>
      size(
        (
          await createMermaid().render(
            'c1',
            withConfig(BODY, `  c4beta:\n    diagramPadding: ${value}`)
          )
        ).svg
      );

    it('diagramPadding: 40 widens and heightens the canvas by 60 px over the default 10', async () => {
      const [w0, h0] = size((await createMermaid().render('c1', BODY)).svg);
      const r = await createMermaid().render('c1', configFixture('diagram-padding.mmd'));
      const [w1, h1] = size(r.svg);
      expect(w1 - w0).toBe(60);
      // The root rounds the height up to a whole pixel; the unrounded layout is exact (config.spec.ts).
      expect(h1 - h0).toBeGreaterThanOrEqual(60);
      expect(h1 - h0).toBeLessThanOrEqual(61);
      expect(r.warnings).toEqual([]);
    });

    it('diagramPadding: 0 is the least, and a value that is not a length draws the default', async () => {
      const [w0, h0] = size((await createMermaid().render('c1', BODY)).svg);
      expect(await padded('0')).toEqual([w0 - 20, h0 - 20]);
      for (const bad of ['-5', '"wide"', '.nan', 'true'])
        expect(await padded(bad), bad).toEqual([w0, h0]);
    });

    it('resolves the section over the c4 section (D534), and puts no default in core', async () => {
      const set = await createMermaid().prepare(
        withConfig(BODY, '  c4beta:\n    diagramPadding: 40')
      );
      expect(set.config.c4beta?.diagramPadding).toBe(40);
      expect(set.config.c4?.diagramMarginX).toBe(50);
      // A default in CORE_DEFAULTS would move every diagram's derived ids; the plugin holds it.
      expect((await createMermaid().prepare(BODY)).config.c4beta).not.toHaveProperty(
        'diagramPadding'
      );
    });

    it('useMaxWidth: false draws the diagram at its own size, and a c4beta value wins over a c4 one', async () => {
      const fit = (await createMermaid().render('c1', BODY)).svg;
      expect(fit).toMatch(/width="100%"/);
      expect(fit).toMatch(/max-width:/);
      const fixed = await createMermaid().render('c1', configFixture('use-max-width-off.mmd'));
      const [w, h] = size(fixed.svg);
      expect(fixed.svg).toContain(`width="${w}"`);
      expect(fixed.svg).toContain(`height="${h}"`);
      expect(fixed.svg).not.toMatch(/max-width:/);
      expect(fixed.warnings).toEqual([]);
      // D534: a key both sections have is read from c4 when c4beta is silent, and c4beta wins.
      const viaC4 = await createMermaid().render(
        'c1',
        withConfig(BODY, '  c4:\n    useMaxWidth: false')
      );
      const viaC4beta = await createMermaid().render(
        'c1',
        withConfig(BODY, '  c4beta:\n    useMaxWidth: false')
      );
      expect(viaC4.svg).toBe(viaC4beta.svg);
      expect(viaC4.svg).not.toBe(fit);
      const both = await createMermaid().render(
        'c1',
        withConfig(BODY, '  c4:\n    useMaxWidth: false\n  c4beta:\n    useMaxWidth: true')
      );
      expect(both.svg).toBe(fit);
    });

    it('leaves legacy C4 to its own section', async () => {
      const legacy = 'C4Context\nPerson(a, "A")\n';
      const plain = (await createMermaid().render('c1', legacy)).svg;
      const set = withConfig(legacy, '  c4beta:\n    useMaxWidth: false\n    diagramPadding: 40');
      expect((await createMermaid().render('c1', set)).svg).toBe(plain);
    });
  });
});

describe('the c4beta stereotype keys (spec #730 T5)', () => {
  const withConfig = (source: string, lines: string): string =>
    `---\nconfig:\n${lines}\n---\n${source}`;
  const BODY = fixture('config-hide-stereotypes-person.mmd').replace(/^---[\s\S]*?\n---\n/, '');
  const lines = async (source: string, m = createMermaid()): Promise<string[]> =>
    texts((await m.render('c1', source)).svg);
  const size = (svg: string): [number, number] => {
    const [, , w, h] = /viewBox="([^"]*)"/.exec(svg)![1]!.split(' ').map(Number);
    return [w!, h!];
  };
  const PERSON = '[Person]';
  const SYSTEM = '[Software System]';
  const CONTAINER = '[Container: Rust]';

  it('shows every type line by default', async () => {
    const all = await lines(BODY);
    for (const line of [PERSON, SYSTEM, CONTAINER]) expect(all).toContain(line);
  });

  it('hideStereotypes: [person] from front matter hides the people line only', async () => {
    const r = await createMermaid().render('c1', fixture('config-hide-stereotypes-person.mmd'));
    const all = texts(r.svg);
    expect(all).not.toContain(PERSON);
    expect(all).toContain('Ledger Clerk');
    expect(all).toContain(SYSTEM);
    expect(all).toContain(CONTAINER);
    expect(r.warnings).toEqual([]);
  });

  it('showStereotypes: false from front matter hides every line, a technology staying', async () => {
    const r = await createMermaid().render('c1', fixture('config-show-stereotypes-off.mmd'));
    const all = texts(r.svg);
    for (const line of [PERSON, SYSTEM, CONTAINER]) expect(all).not.toContain(line);
    expect(all).toContain('[Rust]');
    expect(all).toContain('Ledger Clerk');
    expect(r.warnings).toEqual([]);
  });

  it('hiding a line shrinks the canvas rather than leaving a blank line', async () => {
    const [, h0] = size((await createMermaid().render('c1', BODY)).svg);
    const hidden = await createMermaid().render(
      'c1',
      withConfig(BODY, '  c4beta:\n    showStereotypes: false')
    );
    expect(size(hidden.svg)[1]).toBeLessThan(h0);
  });

  describe('each key arrives intact from front matter, a directive and initialize', () => {
    const hasPerson = (all: string[]): boolean => all.includes(PERSON);
    const hasSystem = (all: string[]): boolean => all.includes(SYSTEM);

    it('hideStereotypes: a block list, a flow list and a directive hide the people line', async () => {
      for (const front of [
        '  c4beta:\n    hideStereotypes:\n      - person',
        '  c4beta:\n    hideStereotypes: [person]',
      ]) {
        const all = await lines(withConfig(BODY, front));
        expect(hasPerson(all), front).toBe(false);
        expect(hasSystem(all), front).toBe(true);
      }
      const viaDirective = await lines(
        '%%{init: {"c4beta": {"hideStereotypes": ["person"]}}}%%\n' + BODY
      );
      expect(hasPerson(viaDirective)).toBe(false);
      expect(hasSystem(viaDirective)).toBe(true);
      const m = createMermaid();
      m.initialize({ c4beta: { hideStereotypes: ['person'] } });
      const viaInit = await lines(BODY, m);
      expect(hasPerson(viaInit)).toBe(false);
      expect(hasSystem(viaInit)).toBe(true);
    });

    it('hideStereotypes: every listed kind is hidden', async () => {
      const all = await lines(
        withConfig(BODY, '  c4beta:\n    hideStereotypes: [person, softwareSystem, container]')
      );
      for (const line of [PERSON, SYSTEM, CONTAINER]) expect(all).not.toContain(line);
    });

    it('hideStereotypes: an empty list hides none, and joins a list set earlier rather than clearing it', async () => {
      expect(hasPerson(await lines(withConfig(BODY, '  c4beta:\n    hideStereotypes: []')))).toBe(
        true
      );
      const m = createMermaid();
      m.initialize({ c4beta: { hideStereotypes: ['person'] } });
      // Arrays union across sources, as v12's `assignWithDepth` did (core's resolveConfig), so
      // an empty list adds nothing and a diagram cannot show a kind the integrator hid.
      expect(
        hasPerson(await lines(withConfig(BODY, '  c4beta:\n    hideStereotypes: []'), m))
      ).toBe(false);
      const viaDirective = await lines(
        '%%{init: {"c4beta": {"hideStereotypes": []}}}%%\n' + BODY,
        m
      );
      expect(hasPerson(viaDirective)).toBe(false);
    });

    it('hideStereotypes: front matter adds to a list set earlier', async () => {
      const m = createMermaid();
      m.initialize({ c4beta: { hideStereotypes: ['person'] } });
      const all = await lines(withConfig(BODY, '  c4beta:\n    hideStereotypes: [container]'), m);
      expect(all).not.toContain(PERSON);
      expect(all).not.toContain(CONTAINER);
      expect(all).toContain(SYSTEM);
    });

    it('showStereotypes: false from a directive and from initialize, and true overrides false', async () => {
      const viaDirective = await lines(
        '%%{init: {"c4beta": {"showStereotypes": false}}}%%\n' + BODY
      );
      expect(hasPerson(viaDirective) || hasSystem(viaDirective)).toBe(false);
      const m = createMermaid();
      m.initialize({ c4beta: { showStereotypes: false } });
      const viaInit = await lines(BODY, m);
      expect(hasPerson(viaInit) || hasSystem(viaInit)).toBe(false);
      const back = await lines(withConfig(BODY, '  c4beta:\n    showStereotypes: true'), m);
      expect(hasPerson(back) && hasSystem(back)).toBe(true);
    });

    it('the resolved config carries the three keys, and core holds no default for them', async () => {
      const set = await createMermaid().prepare(
        withConfig(
          BODY,
          '  c4beta:\n    hideStereotypes: [person]\n    showStereotypes: false\n    personWrappingWidth: 90'
        )
      );
      expect(set.config.c4beta).toMatchObject({
        hideStereotypes: ['person'],
        showStereotypes: false,
        personWrappingWidth: 90,
      });
      const plain = (await createMermaid().prepare(BODY)).config.c4beta;
      for (const key of ['showStereotypes', 'hideStereotypes', 'personWrappingWidth'])
        expect(plain).not.toHaveProperty(key);
    });
  });

  it('leaves legacy C4 to its own section', async () => {
    const legacy = 'C4Context\nPerson(a, "A")\n';
    const plain = (await createMermaid().render('c1', legacy)).svg;
    const set = withConfig(
      legacy,
      '  c4beta:\n    showStereotypes: false\n    hideStereotypes: [person]\n    personWrappingWidth: 40'
    );
    expect((await createMermaid().render('c1', set)).svg).toBe(plain);
  });
});
