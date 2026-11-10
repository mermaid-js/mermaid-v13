import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { railroad } from '@mermaid-js/diagram-railroad';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// Railroad diagrams are a first-party type (#615): v12's four types, one per notation, go to
// `@mermaid-js/diagram-railroad` through the generated registry (one plugin, D511), after
// treemap and before venn as in v12's detector order, and no longer fail with
// UNSUPPORTED_DIAGRAM (R-COMPAT-7).
const NOTATIONS = [
  ['railroad', 'railroad-beta\nexpr = sequence(nonterminal("term"), terminal("+")) ;\n'],
  ['railroadEbnf', 'railroad-ebnf-beta\nexpr = term , { "+" , term } ;\n'],
  ['railroadAbnf', 'railroad-abnf-beta\nexpr = term *( "+" term ) ;\n'],
  ['railroadPeg', 'railroad-peg-beta\nexpr <- term ("+" term)* ;\n'],
] as const;
const TEXT: string = NOTATIONS[0][1];

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const root = (svg: string): string => /<svg [^>]*>/.exec(svg)?.[0] ?? '';
const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
/** The first terminal's `rect` fill. */
const terminalFill = (svg: string): string | undefined =>
  /<g class="railroad-terminal"[^>]*><rect [^>]*fill="([^"]*)"/.exec(svg)?.[1];
const init = (railroadConfig: Record<string, unknown>, text: string = TEXT): string =>
  `%%{init: ${JSON.stringify({ railroad: railroadConfig })}}%%\n${text}`;

describe('railroad diagrams through the public API (#615)', () => {
  it.each(NOTATIONS)(
    'renders %s, where it was UNSUPPORTED_DIAGRAM before the port',
    async (type, text) => {
      const result = await createMermaid().render('r1', text);
      expect(result.diagramType).toBe(type);
      expect(result.svg).toContain(`aria-roledescription="${type}"`);
      expect(result.svg).toContain('class="mermaid mermaid-railroad railroad-diagram"');
      expect(result.svg.match(/<g class="railroad-rule"/g)).toHaveLength(1);
      expect(result.svg).toContain('<g class="railroad-terminal"');
      expect(result.svg).toContain('<g class="railroad-nonterminal"');
      expect(result.svg).not.toContain('foreignObject');
      expect(result.svg).not.toContain('<style');
      expect(result.svg).not.toContain('NaN');
      expect(result.warnings).toEqual([]);
      assertInert(result.svg);
    }
  );

  it('renders through mermaid/slim, byte for byte as mermaid does, in every notation', async () => {
    const slim = createSlim({ diagrams: [railroad] });
    for (const [, text] of NOTATIONS) {
      expect((await slim.render('r2', text)).svg).toBe(
        (await createMermaid().render('r2', text)).svg
      );
    }
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    for (const [type, text] of NOTATIONS) {
      await m.prepare(text);
      expect(m.renderSync(text).diagramType).toBe(type);
    }
  });

  it('keeps v12’s detector patterns and places, after treemap and before venn', () => {
    const types = DETECTORS.map((d) => d.type);
    const at = types.indexOf('railroad');
    expect(at).toBe(types.indexOf('treemap') + 1);
    expect(types.slice(at, at + 5)).toEqual([
      'railroad',
      'railroadEbnf',
      'railroadAbnf',
      'railroadPeg',
      'venn',
    ]);
    for (const d of DETECTORS.slice(at, at + 4)) expect(d.id).toBe('railroad');
    const m = createMermaid();
    // Case-insensitive, with no word boundary, as v12's `/^\s*railroad-ebnf-beta/i`.
    expect(m.detectType('  railroad-ebnf-beta\na = "x" ;')).toBe('railroadEbnf');
    expect(m.detectType('RAILROAD-PEG-BETA\na <- "x" ;')).toBe('railroadPeg');
    expect(m.detectType('railroad-betax\n')).toBe('railroad');
  });

  it('rejects what v12 rejects, detected headers included (D513)', async () => {
    const m = createMermaid();
    for (const text of [
      // Detected whatever the case, then the keyword is read in lower case only.
      'RAILROAD-EBNF-BETA\na = "x" ;\n',
      'railroad-betax\na = terminal("x") ;\n',
      // ABNF's `;` starts a comment, so the first rule never ends.
      'railroad-abnf-beta\na = "x" ; b = "y" ;\n',
      'railroad-beta\nchoice = terminal("x") ;\n',
    ]) {
      const e = await rejection(m.render('r3', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
  });

  it('honours the railroad section over its generated defaults (D515)', async () => {
    const m = createMermaid();
    const plain = await m.render('r4', TEXT);
    // The generated defaults are v12's: an author's own v12 values draw the same bytes.
    const v12 = init({
      padding: 10,
      verticalSeparation: 8,
      horizontalSeparation: 10,
      arcRadius: 10,
      markerRadius: 5,
      strokeWidth: 2,
    });
    expect((await m.render('r4', v12)).svg).toBe(plain.svg);
    for (const key of [
      'padding',
      'verticalSeparation',
      'horizontalSeparation',
      'arcRadius',
      'markerRadius',
    ]) {
      // A choice of a sequence and an optional: every length moves something.
      const arcs =
        'railroad-beta\nx = choice(sequence(terminal("a"), terminal("b")), optional(terminal("c"))) ;\n';
      expect((await m.render('r4', init({ [key]: 30 }, arcs))).svg, key).not.toBe(
        (await m.render('r4', arcs)).svg
      );
      const changed = await m.render('r4', init({ [key]: 30 }));
      expect(changed.warnings, key).toEqual([]);
    }
    expect(root((await m.render('r4', init({ strokeWidth: 3 }))).svg)).toContain(
      'stroke-width="3"'
    );
    // v12's reading (`sanitizeNumberValue`): a string through `parseFloat`, so "30px" is 30.
    expect((await m.render('r4', init({ padding: '30px' }))).svg).toBe(
      (await m.render('r4', init({ padding: 30 }))).svg
    );
    const fixed = await m.render('r4', init({ useMaxWidth: false }));
    const [, , w, h] = box(fixed.svg)!.split(' ');
    expect(root(fixed.svg)).toContain(`width="${w}" height="${h}"`);
    expect(fixed.svg).not.toContain('max-width');
  });

  it.each([
    ['padding', -4],
    ['padding', 1e308],
    ['verticalSeparation', 1e4],
    ['horizontalSeparation', 'wide'],
    ['arcRadius', 1e308],
    ['markerRadius', Number.MAX_VALUE],
    ['strokeWidth', 1e308],
    ['fontSize', 1e308],
    ['fontSize', -1],
  ])(
    'draws railroad.%s %s with the default, with one RAILROAD_CONFIG_INVALID',
    async (key, value) => {
      const m = createMermaid();
      const plain = await m.render('r10', TEXT);
      const bad = await m.render('r10', init({ [key]: value }));
      expect(bad.svg).toBe(plain.svg);
      expect(bad.svg).not.toMatch(/NaN|Infinity/);
      expect(bad.warnings.map((w) => w.code)).toEqual(['RAILROAD_CONFIG_INVALID']);
      expect(bad.warnings[0]!.path).toBe(`railroad.${key}`);
    }
  );

  it('draws the theme’s font and colours where the section sets none (D515, D516)', async () => {
    const m = createMermaid();
    const plain = await m.render('r5', TEXT);
    expect(root(plain.svg)).toContain('font-family="var(--_ff)" font-size="var(--_fs)"');
    expect(terminalFill(plain.svg)).toBe('var(--_rtf)');
    const font = await m.render('r5', init({ fontFamily: 'serif', fontSize: 20 }));
    expect(root(font.svg)).toContain('font-family="serif" font-size="20"');
    expect(box(font.svg)).not.toBe(box(plain.svg));
    // A config colour beats the theme variable.
    const fill = await m.render('r5', init({ terminalFill: '#ff0000' }));
    expect(terminalFill(fill.svg)).toBe('#ff0000');
    expect(fill.warnings).toEqual([]);
  });

  it('drops an unusable colour or font with one RAILROAD_CONFIG_INVALID (D515)', async () => {
    const m = createMermaid();
    const plain = await m.render('r6', TEXT);
    const bad = await m.render('r6', init({ terminalFill: 'url(x)', fontSize: 'big' }));
    expect(bad.svg).toBe(plain.svg);
    expect(bad.warnings.map((w) => w.code)).toEqual(['RAILROAD_CONFIG_INVALID']);
    expect(bad.warnings[0]!.message).toContain('railroad.terminalFill');
    expect(bad.warnings[0]!.message).toContain('railroad.fontSize');
  });

  it('ignores compactMode, showMarkers, the comment keys and useWidth (D515)', async () => {
    const m = createMermaid();
    const plain = await m.render('r7', TEXT);
    const ignored = await m.render(
      'r7',
      init({
        compactMode: true,
        showMarkers: false,
        commentFill: '#ff0000',
        commentStroke: '#ff0000',
        commentTextColor: '#ff0000',
        useWidth: 99,
      })
    );
    expect(ignored.svg).toBe(plain.svg);
    expect(ignored.warnings).toEqual([]);
  });

  it('takes a railroad-scoped theme over the top level, in all four notations', async () => {
    const m = createMermaid();
    for (const [, text] of NOTATIONS) {
      const dark = await m.render('r8', '---\nconfig:\n  theme: dark\n---\n' + text);
      expect(dark.svg).not.toBe((await m.render('r8', text)).svg);
      expect((await m.render('r8', init({ theme: 'dark' }, text))).svg).toBe(dark.svg);
    }
  });

  it('draws ascii in all four notations from the lazily loaded ./ascii entry (#617, D518)', async () => {
    const m = createMermaid();
    for (const [type, text] of NOTATIONS) {
      expect(m.supportsFormat(type, 'svg')).toBe(true);
      expect(m.supportsFormat(type, 'ascii')).toBe(true);
      const result = await m.render('r9', text, { format: 'ascii' });
      expect(result).toMatchObject({ format: 'ascii', diagramType: type, warnings: [] });
      expect(result.text).toMatch(/^expr = ●─┤ term ├─/m);
      expect(m.renderSync(text, { format: 'ascii' }).text).toBe(result.text);
    }
    const result = await m.render('r9', TEXT, { format: 'ascii' });
    expect(result.text).toBe(
      ['         ┌──────┐ ╭───╮', 'expr = ●─┤ term ├─┤ + ├─●', '         └──────┘ ╰───╯'].join('\n')
    );
    expect(result).toMatchObject({ columns: 25, rows: 3 });
    expect(
      m.renderSync(TEXT, { format: 'ascii', config: { ascii: { charset: 'ascii' } } }).text
    ).toContain('expr = o-+ term +-+ + +-o');
  });

  it('never crops: a drawing wider than ascii.maxWidth warns ASCII_TOO_WIDE (R-ASCII-8)', async () => {
    const m = createMermaid();
    const wide = await m.render('r10', TEXT, {
      format: 'ascii',
      config: { ascii: { maxWidth: 10 } },
    });
    expect(wide.columns).toBe(25);
    expect(wide.text).toBe((await m.render('r10', TEXT, { format: 'ascii' })).text);
    expect(wide.warnings.map((w) => w.code)).toEqual(['ASCII_TOO_WIDE']);
  });
});
