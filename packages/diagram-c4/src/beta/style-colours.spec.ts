import { describe, expect, it } from 'vitest';
import { C4_COLOR_INVALID, C4BETA_STYLE_IGNORED } from '../codes.ts';
import { renderC4BetaForTest } from '../render/harness.ts';
import { lex } from './lexer.ts';
import { parseC4Beta } from './parser.ts';
import { T } from './tokens.ts';

/**
 * The colours a c4-beta `style` takes (D635, #929): the colour forms the lexer reads as one value,
 * the line a value it cannot read drops with a warning instead of an error, the words that are
 * not CSS colours, and what `C4BETA_STYLE_IGNORED` says each key takes. The #929 samples are
 * fixtures in `e2e/diagrams/c4beta/pr-check/style-*.mmd`, rendered through `createMermaid()` in
 * `packages/conformance/src/c4beta/style-colours.spec.ts`.
 */
const H = 'c4-beta\n';

/** The kind and text of each token of `src`. */
function tokens(src: string): [number, string][] {
  const t = lex(src, 0, []);
  const out: [number, string][] = [];
  for (let j = 0; j < t.length; j++) {
    const start = t.start[j] ?? 0;
    out.push([t.kind[j] ?? 0, src.slice(start, t.end[j])]);
  }
  return out;
}

/** The kind of the token that is exactly `text` in `src`, or undefined when none is. */
const kindOf = (src: string, text: string): number | undefined =>
  tokens(src).find(([, t]) => t === text)?.[0];

describe('the colour values the lexer reads', () => {
  it('reads `#` and 3, 4, 6 or 8 hex digits as one value, and no other count', () => {
    for (const hex of ['#abc', '#cf0a', '#1f2937', '#ff000080'])
      expect(kindOf(`style x fill:${hex}`, hex), hex).toBe(T.Hex);
    for (const hex of ['#12', '#12345', '#1234567', '#123456789'])
      expect(kindOf(`style x fill:${hex}`, hex), hex).toBeUndefined();
  });

  it('reads rgb(), rgba(), hsl() and hsla() on one line as one value', () => {
    for (const call of [
      'rgb(255,0,0)',
      'rgba(1, 2, 3, 0.5)',
      'hsl(210 80% 85%)',
      'hsla(0,0%,0%,1)',
    ])
      expect(kindOf(`style x fill:${call}, stroke:red`, call), call).toBe(T.ColorFunction);
  });

  it('reads a call it cannot close, a nested one or another name as a word', () => {
    expect(kindOf('style x fill:rgb(1, 2', 'rgb')).toBe(T.Id);
    expect(kindOf('style x fill:rgb(calc(1), 0, 0)', 'rgb')).toBe(T.Id);
    expect(kindOf('style x fill:rgb(1, 2\n)', 'rgb')).toBe(T.Id);
    expect(kindOf('style x fill:rgb(1 %% 2)', 'rgb')).toBe(T.Id);
    expect(kindOf('style x fill:lab(1 2 3)', 'lab')).toBe(T.Id);
  });

  it('keeps `rgb` an id where no `(` follows it', () => {
    const r = parseC4Beta(`${H}person rgb "RGB"\nperson hsl "HSL"\nrgb --> hsl`);
    expect(r.diagnostics).toEqual([]);
    expect(r.model.elements.map((e) => e.id)).toEqual(['rgb', 'hsl']);
  });
});

describe('a style value the lexer cannot read', () => {
  it('drops only its line, with one C4_COLOR_INVALID that lists the colour forms', () => {
    const r = parseC4Beta(
      `${H}person p "P" :::x\nstyle x fill:#12, stroke:red\nstyle p fill:#cf0a\nperson q "Q"`
    );
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([['warning', C4_COLOR_INVALID]]);
    const [warning] = r.diagnostics;
    expect(warning?.message).toContain('`fill:#12` at line 3');
    expect(warning?.message).toContain('3, 4, 6 or 8 hex digits');
    expect(warning?.message).toContain('`rgb(…)`');
    expect(r.model.styles.map((s) => s.target)).toEqual(['p']);
    expect(r.model.elements.map((e) => e.id)).toEqual(['p', 'q']);
  });

  it('names every dropped line in the one warning', () => {
    const r = parseC4Beta(`${H}style a fill:#12\nstyle b stroke:rgb(1, 2\nstyle c color:red;`);
    expect(r.diagnostics.map((d) => d.code)).toEqual([C4_COLOR_INVALID]);
    expect(r.diagnostics[0]?.message).toMatch(
      /`fill:#12` at line 2, `stroke:rgb\(1, 2` at line 3, `color:red;` at line 4\.$/
    );
    expect(r.model.styles).toEqual([]);
  });

  it('is still an error when the text after the value is wrong', () => {
    const r = parseC4Beta(`${H}style a fill:red stroke:blue`);
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([['error', 'UNEXPECTED']]);
  });
});

describe('what C4BETA_STYLE_IGNORED says', () => {
  it('names what each key takes', () => {
    const r = parseC4Beta(`${H}style async line:#7c3aed, shape:hexagon, size:big`);
    expect(r.diagnostics.map((d) => d.code)).toEqual([C4BETA_STYLE_IGNORED]);
    expect(r.diagnostics[0]?.message).toBe(
      'These style entries are ignored (`fill`, `stroke` and `color` take a colour; `line` takes `solid`, `dashed` or `dotted`; `shape` takes `cylinder`): `line:#7c3aed` at line 2, `shape:hexagon` at line 2, `size:big` at line 2.'
    );
  });
});

describe('a colour word that is not a CSS colour', () => {
  const LEDGER = `${H}softwareSystem t "Ledger" :::ledger\n`;

  it('is dropped with C4_COLOR_INVALID naming it and its line, and the theme colour is drawn', async () => {
    const r = await renderC4BetaForTest(`${LEDGER}style ledger fill:lightgren`);
    expect(r.svg).not.toContain('lightgren');
    const theme = await renderC4BetaForTest(LEDGER);
    const body = (svg: string) => /class="label-container"[^>]*>/.exec(svg)?.[0];
    expect(body(r.svg)).toBe(body(theme.svg));
    const colour = r.warnings.filter((w) => w.code === C4_COLOR_INVALID);
    expect(colour).toHaveLength(1);
    expect(colour[0]?.message).toContain('`fill:lightgren` in `style ledger` at line 3');
  });

  it('names each refused word once, in one warning, however many items it paints', async () => {
    const r = await renderC4BetaForTest(
      `${H}legend on\nsoftwareSystem a "A" :::t\nsoftwareSystem b "B" :::t\na --> b : "x" :::t\nstyle t fill:notacolour, stroke:dark-green`
    );
    expect(r.svg).not.toMatch(/notacolour|dark-green/);
    const colour = r.warnings.filter((w) => w.code === C4_COLOR_INVALID);
    expect(colour).toHaveLength(1);
    expect(colour[0]?.message).toMatch(
      /: `fill:notacolour` in `style t` at line 6, `stroke:dark-green` in `style t` at line 6\.$/
    );
  });

  it('gives a tag whose colours are all refused no legend row, as its items draw the theme', async () => {
    const r = await renderC4BetaForTest(
      `${H}legend on\nsoftwareSystem a "A" :::ok\nsoftwareSystem b "B" :::bad\nstyle ok fill:#112233\nstyle bad fill:lightgren, stroke:notacolour`
    );
    // The kind row and `ok`'s; `bad` has none.
    expect(r.svg.match(/class="c4-legend-swatch"/g)).toHaveLength(2);
    expect(r.svg).toContain('fill="#112233"');
  });

  it('lets through CSS colour names in any case, `transparent` and `currentColor`', async () => {
    const r = await renderC4BetaForTest(
      `${H}softwareSystem a "A" :::t\nstyle t fill:LightGreen, stroke:grey, color:currentColor\nstyle softwareSystem fill:transparent`
    );
    expect(r.warnings.filter((w) => w.code === C4_COLOR_INVALID)).toEqual([]);
    expect(r.svg).toContain('fill="LightGreen"');
    expect(r.svg).toContain('stroke="grey"');
    expect(r.svg).toContain('fill="currentColor"');
  });

  it('draws the hex and function forms the lexer reads', async () => {
    const r = await renderC4BetaForTest(
      `${H}softwareSystem a "A" :::t\nstyle t fill:rgb(255,0,0), stroke:#cf0a, color:#ff000080`
    );
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain('fill="rgb(255,0,0)"');
    expect(r.svg).toContain('stroke="#cf0a"');
    expect(r.svg).toContain('fill="#ff000080"');
  });
});
