/**
 * #929 (spec #962 T4, D635): the c4-beta `style` colour fixtures, rendered through the public
 * `render()`. A misspelt colour name is dropped with `C4_COLOR_INVALID` instead of painting the
 * element black; `#rgba`, `#rrggbbaa` and the colour functions are drawn; a value the lexer cannot
 * read drops its line with a warning while the rest of the diagram renders; and
 * `C4BETA_STYLE_IGNORED` names what `line` takes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../corpus.ts';

const DIR = join(REPO_ROOT, 'e2e/diagrams/c4beta/pr-check');

async function render(fixture: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true } as InitializeConfig);
  return m.render('c4beta-style', readFileSync(join(DIR, fixture), 'utf8'));
}

const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);

describe('#929: c4-beta style colours through render()', () => {
  it('drops a misspelt colour name with C4_COLOR_INVALID, and draws the theme colour', async () => {
    const r = await render('style-colour-misspelt.mmd');
    expect(codes(r)).toEqual(['C4_COLOR_INVALID']);
    expect(r.warnings[0]?.message).toContain('`fill:lightgren` in `style ledger` at line');
    expect(r.svg).not.toContain('fill="lightgren"');
    expect(r.svg).toContain('fill="lightgreen"');
  });

  it('draws a colour with an alpha channel', async () => {
    const r = await render('style-colour-alpha.mmd');
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain('fill="#ff000080"');
  });

  it('draws every colour form, and drops only the line it cannot read', async () => {
    const r = await render('style-colour-forms.mmd');
    expect(codes(r)).toEqual(['C4_COLOR_INVALID']);
    expect(r.warnings[0]?.message).toMatch(/`fill:#12` at line \d+\.$/);
    expect(r.warnings[0]?.message).toContain('3, 4, 6 or 8 hex digits');
    for (const drawn of [
      'fill="#cf0a"',
      'fill="#ff000080"',
      'fill="rgb(185,28,28)"',
      'stroke="rgba(127, 29, 29, 0.8)"',
      'fill="hsl(210 80% 85%)"',
      'stroke="hsla(210, 80%, 30%, 0.9)"',
      'stroke="rgb(37 99 235 / 60%)"',
    ])
      expect(r.svg, drawn).toContain(drawn);
    // The element whose style was dropped is drawn, in its theme colours.
    expect(r.svg).toContain('data-id="e"');
  });

  it('names what `line` takes when its value is not one', async () => {
    const r = await render('style-line-value-ignored.mmd');
    expect(codes(r)).toEqual(['C4BETA_STYLE_IGNORED']);
    expect(r.warnings[0]?.message).toContain('`line` takes `solid`, `dashed` or `dotted`');
    expect(r.warnings[0]?.message).toContain('`line:#7c3aed` at line');
  });
});
