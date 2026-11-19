/**
 * ER under classic-theme overrides (spec #795 T3), through the public `render()` with literal
 * colours: attribute text takes the ink against its own row's fill (#758), and the relationship
 * label is filled with the theme background whatever `tertiaryColor` is (D628, replacing #761's
 * half-opaque `tertiaryColor`). Sources are the issues' fixtures under
 * `e2e/diagrams/er-diagram/baseline/themes/`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, parseColor, type Rgba } from '@mermaid-js/core/theme';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

const FIXTURES = join(REPO_ROOT, 'e2e/diagrams/er-diagram/baseline/themes');

/** Renders a fixture, under another theme when `theme` replaces its front matter's. */
async function render(fixture: string, theme?: string): Promise<SvgView> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  let source = readFileSync(join(FIXTURES, fixture), 'utf8');
  if (theme) source = source.replace(/^ {2}theme: .*$/m, `  theme: ${theme}`);
  const config = { output: { cssVariables: false } };
  return parseSvg((await m.render('mermaid-0', source, { config })).svg);
}

/** The fill a text inherits: its own, else its nearest ancestor's. */
function inkOf(node: SvgElement): string {
  for (let n: SvgElement | undefined = node; n; n = n.parent)
    if (n.attrs.fill !== undefined) return n.attrs.fill;
  throw new Error('no fill');
}

const rgba = (c: string): Rgba => {
  const v = parseColor(c);
  if (!v) throw new Error(`not a colour: ${c}`);
  return v;
};

const labelFill = (tree: SvgView): string | undefined => {
  const label = tree.find({ class: 'edgeLabel' })[0]!;
  return tree.children(label).find((c) => tree.tag(c) === 'rect')?.attrs.fill;
};

describe('ER under classic-theme overrides (#795 T3)', () => {
  it('inks attribute text against its own row under base with a dark primaryColor (#758)', async () => {
    const tree = await render('base-dark-primary.mmd');
    const rows = [
      ...tree.find({ class: 'row-rect-odd' }),
      ...tree.find({ class: 'row-rect-even' }),
    ];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const fill = tree.children(row).find((c) => tree.tag(c) === 'rect')!.attrs.fill!;
      for (const text of tree.children(row).filter((c) => tree.tag(c) === 'text')) {
        const ratio = contrastRatio(rgba(inkOf(text)), rgba(fill));
        expect(ratio, `${row.attrs.class} ${text.attrs.class}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The header keeps the ink against the entity fill.
    const name = tree.find({ class: 'name' })[0]!;
    const outline = tree.find({ class: 'outer-path' })[0]!;
    expect(contrastRatio(rgba(inkOf(name)), rgba(outline.attrs.fill!))).toBeGreaterThanOrEqual(4.5);
  });

  it('fills the relationship label with the background, not tertiaryColor, in every family (D628)', async () => {
    const fills = { default: '#ffffff', dark: '#333333', redux: '#ffffff', neo: '#ffffff' };
    for (const [theme, fill] of Object.entries(fills))
      expect(labelFill(await render('default-tertiary-label.mmd', theme)), theme).toBe(fill);
  });
});
