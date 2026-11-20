import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';

// c4-beta is the second header type of the `c4` plugin (spec #730): detected, routed, laid out by
// core's `layered` engine and drawn with C4's painters.
const FIXTURES = join(import.meta.dirname, '../../../e2e/diagrams/c4beta');
const PR_CHECK = 'pr-check';
const fixture = (name: string, tier = PR_CHECK): string =>
  readFileSync(join(FIXTURES, tier, name), 'utf8');

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
      'markup-and-quotes-in-every-text.mmd': ['HTML_DROPPED'],
      'style-colour-forms.mmd': ['C4_COLOR_INVALID'],
      'style-colour-misspelt.mmd': ['C4_COLOR_INVALID'],
      'style-line-value-ignored.mmd': ['C4BETA_STYLE_IGNORED'],
    };
    const m = createMermaid();
    const files = readdirSync(join(FIXTURES, PR_CHECK)).filter((f) => f.endsWith('.mmd'));
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

  it('draws text output in both charsets, ASCII with no character outside ASCII', async () => {
    const src = fixture('nested-boundaries.mmd');
    const m = createMermaid();
    const unicode = await m.render('c1', src, { format: 'ascii' });
    expect(unicode.format).toBe('ascii');
    expect(unicode.diagramType).toBe('c4beta');
    expect(unicode.text).toMatch(/[╭╮╰╯│─]/);
    const plain = await m.render('c1', src, { format: 'ascii', ascii: { charset: 'ascii' } });
    expect(plain.text).toMatch(/^[\x20-\x7e\n]+$/);
    expect(plain.text).toContain('+');
  });

  it('writes markup and quotes in every text as text, and ignores a legacy palette colour that is not one', async () => {
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
    expect(r.svg).toMatch(
      /c4-person"[^>]*><rect [^>]*stroke="var\(--_c4peb\)"[^>]*fill="var\(--_bg\)"/
    );
    expect(r.svg).not.toContain('onload="alert(1)');
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
    // The fixture's own front matter (its description) goes, so `withConfig` can add one.
    const BODY = fixture('b02-basic-context.mmd').replace(/^---\n[\s\S]*?\n---\n/, '');
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

    describe('the legend (T3)', () => {
      const legendRows = (svg: string): string[] => {
        const legend = /<g class="c4-legend">([\s\S]*?)<\/g>/.exec(svg)?.[1] ?? '';
        return texts(legend);
      };
      const viewBox = (svg: string): number[] =>
        /viewBox="([^"]*)"/.exec(svg)![1]!.split(' ').map(Number);

      it('draws a heading and one row per kind in use, and none for a kind the diagram lacks', async () => {
        const r = await createMermaid().render('c1', fixture('legend-kinds.mmd'));
        expect(legendRows(r.svg)).toEqual([
          'Legend',
          'Person',
          'External Software System',
          'Software System',
          'Container',
          'Component',
        ]);
        expect(r.warnings).toEqual([]);
        assertInert(r.svg);
      });

      it('adds a row for each tag style with a colour that an element or relation uses, and for no other', async () => {
        const r = await createMermaid().render('c1', fixture('legend-tag-styles.mmd'));
        expect(legendRows(r.svg)).toEqual(['Legend', 'Person', 'Container', 'critical', 'async']);
        expect(r.warnings.map((w) => w.code)).toEqual([]);
      });

      it('is gone with `legend off`, and the canvas shrinks by what it held', async () => {
        const on = await createMermaid().render('c1', fixture('legend-kinds.mmd'));
        const off = await createMermaid().render('c1', fixture('legend-off.mmd', 'nightly-check'));
        expect(off.svg).not.toContain('c4-legend');
        const [, , , heightOn] = viewBox(on.svg);
        const [, , , heightOff] = viewBox(off.svg);
        expect(heightOn!).toBeGreaterThan(heightOff!);
      });

      it('is shown when the source says nothing about it', async () => {
        const r = await createMermaid().render('c1', fixture('b02-basic-context.mmd'));
        expect(legendRows(r.svg)[0]).toBe('Legend');
        const off = await createMermaid().render('c1', fixture('b10-direction-legend-acc.mmd'));
        expect(off.svg).not.toContain('c4-legend');
      });

      it('lies inside the viewBox', async () => {
        const r = await createMermaid().render('c1', fixture('legend-tag-styles.mmd'));
        const [, , width, height] = viewBox(r.svg);
        const legend = /<g class="c4-legend">([\s\S]*?)<\/g>/.exec(r.svg)![1]!;
        for (const m of legend.matchAll(
          /<rect [^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g
        )) {
          const [x, y, w, h] = m.slice(1).map(Number);
          expect(x! + w!).toBeLessThanOrEqual(width!);
          expect(y! + h!).toBeLessThanOrEqual(height!);
        }
      });
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

  /** The lines the person's description is drawn in. */
  const personLines = (svg: string): number => {
    const person = /<g class="node c4-shape c4-person"[\s\S]*?<\/g><\/g>/.exec(svg)![0];
    return /<text class="c4-descr"[\s\S]*?<\/text>/.exec(person)![0].split('<tspan').length - 1;
  };

  it('personWrappingWidth from front matter wraps a person alone', async () => {
    const source = fixture('config-person-wrapping-width.mmd');
    const unset = await createMermaid().render(
      'c1',
      source.replace('    personWrappingWidth: 120\n', '')
    );
    const narrow = await createMermaid().render('c1', source);
    // 120 px breaks the description into more lines than the width every element wraps at.
    expect(personLines(narrow.svg)).toBeGreaterThan(personLines(unset.svg));
    expect(narrow.warnings).toEqual([]);
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

    it('personWrappingWidth from a directive and from initialize, and front matter wins over initialize', async () => {
      const viaDirective = await createMermaid().render(
        'c1',
        '%%{init: {"c4beta": {"personWrappingWidth": 120}}}%%\n' + BODY
      );
      const m = createMermaid();
      m.initialize({ c4beta: { personWrappingWidth: 120 } });
      const viaInit = await m.render('c1', BODY);
      expect(personLines(viaDirective.svg)).toBeGreaterThan(
        personLines((await createMermaid().render('c1', BODY)).svg)
      );
      expect(viaInit.svg).toBe(viaDirective.svg);
      const over = await m.render('c1', withConfig(BODY, '  c4beta:\n    personWrappingWidth: 60'));
      expect(personLines(over.svg)).toBeGreaterThan(personLines(viaInit.svg));
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

// c4-beta draws text through the one `c4` plugin's lazily loaded `ascii` entry (spec #730 T7).
describe('c4-beta text output (spec #730 T7)', () => {
  const BODY = 'c4-beta\nperson a "A"\nsoftwareSystem s "S"\na --> s : "uses"\n';

  it('says so through supportsFormat, for both types of the plugin', () => {
    const m = createMermaid();
    expect(m.supportsFormat('c4beta', 'ascii')).toBe(true);
    expect(m.supportsFormat('c4beta', 'svg')).toBe(true);
    expect(m.supportsFormat('c4', 'ascii')).toBe(true);
  });

  it('resolves prepare and preload for ascii, then draws with renderSync', async () => {
    const m = createMermaid();
    await m.preload({ types: ['c4beta'], formats: ['ascii'] });
    await m.prepare(BODY, { format: 'ascii' });
    const out = m.renderSync(BODY, { format: 'ascii' });
    expect(out.diagramType).toBe('c4beta');
    expect(out.text).toContain('[Person]');
    expect(out.text).toContain('uses');
  });

  it('gives a broken source its syntax error, not UNSUPPORTED_FORMAT', async () => {
    const e = await rejection(
      createMermaid().render('c1', 'c4-beta\nperson\n', { format: 'ascii' })
    );
    expect(e).toBeInstanceOf(MermaidError);
    expect(e).not.toBeInstanceOf(UnsupportedFormatError);
    expect((e as MermaidError).code).not.toBe('UNSUPPORTED_FORMAT');
    expect((e as MermaidError).diagnostics.length).toBeGreaterThan(0);
  });

  it('draws a block embedded in a flowchart as its own text, with no stand-in', async () => {
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
    expect(out.text).not.toContain('[c4beta]');
    expect(out.text).toContain('[Person]');
    expect(out.warnings.filter((w) => w.code === 'ASCII_DROPPED' && w.feature === 'embed')).toEqual(
      []
    );
  });

  const dropped = async (src: string, charset: 'unicode' | 'ascii' = 'unicode') =>
    (await createMermaid().render('c1', src, { format: 'ascii', ascii: { charset } })).warnings
      .filter((w) => w.code === 'ASCII_DROPPED')
      .map((w) => (w as { feature?: string }).feature);

  it('drops what text cannot show, one ASCII_DROPPED warning for each kind', async () => {
    const styled = `c4-beta\naccTitle: T\n${BODY.slice(8)}style person fill:#f00\n`;
    expect(await dropped(styled)).toEqual(['style', 'legend', 'accessibility']);
    // A diagram with none of them says only what every c4-beta text drawing leaves out.
    expect(await dropped(BODY)).toEqual(['legend']);
    expect(await dropped(`${BODY}legend off\n`)).toEqual([]);
    // A shape the text draws as caps, and a style naming nothing drawn, are not drops.
    expect(await dropped(`${BODY}legend off\nstyle person shape:cylinder\n`)).toEqual([]);
    expect(await dropped(`${BODY}legend off\nstyle nobody fill:#f00\n`)).toEqual([]);
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
    ['a byte-order mark', '\uFEFF'],
    ['a no-break space', '\u00A0'],
    ['both, and a line break', '\uFEFF\n\u00A0 '],
  ])('renders after %s, as legacy C4 does', async (_, lead) => {
    const m = createMermaid();
    const beta = await m.render('c1', `${lead}c4-beta\nperson a "A"\n`);
    expect(beta.diagramType).toBe('c4beta');
    expect(beta.svg).toBe((await m.render('c1', 'c4-beta\nperson a "A"\n')).svg);
    expect((await m.render('c1', `${lead}C4Context\nPerson(a, "A")\n`)).diagramType).toBe('c4');
  });
});
