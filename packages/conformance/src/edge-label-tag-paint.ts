/**
 * The fill and ink of each edge-label tag (D626) in a render, for the per-type tag specs of spec
 * #1334 (D713, D715): a fixture from `e2e/diagrams/<folder>/baseline/edge-labels`, rendered with
 * `cssVariables` off so each paint is a literal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, parseColor } from '@mermaid-js/core/theme';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { expect, it } from 'vitest';
import { REPO_ROOT } from './corpus.ts';
import { hex } from './hex.ts';
import { parseSvg } from './svg-tree.ts';

/** A tag's paints, as exact hex. */
export interface TagPaint {
  readonly fill: string;
  readonly ink: string;
}

/** A fixture's source, by its path under `e2e/diagrams`. */
export const diagramFixture = (path: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams', path), 'utf8');

/** `e2e/diagrams/<folder>/baseline/edge-labels/<name>.mmd`. */
const tagFixture = (folder: string, name: string): string =>
  diagramFixture(`${folder}/baseline/edge-labels/${name}.mmd`);

/** The SVG of `source`, with literal paints, under this theme and these theme variables. */
export async function renderTags(
  source: string,
  { theme, themeVariables }: { theme?: string; themeVariables?: Record<string, string> } = {}
): Promise<string> {
  const m = createMermaid();
  m.initialize({
    deterministic: true,
    output: { cssVariables: false },
    ...(theme && { theme }),
    ...(themeVariables && { themeVariables }),
  } as InitializeConfig);
  return (await m.render('tag1334', source)).svg;
}

/** Each `g.edgeLabel`'s box fill and text fill. */
export function tagPaints(svg: string): TagPaint[] {
  const tree = parseSvg(svg);
  return tree.find({ class: 'edgeLabel' }).map((g) => {
    const [rect, text] = ['rect', 'text'].map((tag) =>
      tree.children(g).find((c) => tree.tag(c) === tag)
    );
    return {
      fill: hex(tree.getAttr(rect!, 'fill'), String),
      ink: hex(tree.getAttr(text!, 'fill'), String),
    };
  });
}

/** The contrast of a tag's ink on its fill. */
export const tagContrast = ({ fill, ink }: TagPaint): number =>
  contrastRatio(parseColor(ink)!, parseColor(fill)!);

/**
 * A type's tag variables (D715) through `render()`: `<prefix>EdgeLabelBackground` recolours
 * the tags of `fixtures` and nothing else, and a light background under the dark theme leaves
 * the ink readable on the tag (D713). Each fixture is a name in `<folder>/baseline/edge-labels`.
 * `authored` are inks an author set on one edge in the first fixture: they win as written, with
 * no contrast check (D713), so the readability check skips them.
 */
export function describeTagVariables(
  prefix: string,
  folder: string,
  fixtures: readonly string[],
  authored: readonly string[] = []
): void {
  const own = `${prefix}EdgeLabelBackground`;
  it.each(fixtures)(`${own} recolours only the tags of %s`, async (name) => {
    const source = tagFixture(folder, name);
    const plain = await renderTags(source);
    const tagged = await renderTags(source, { themeVariables: { [own]: '#ffe0a0' } });
    const before = tagPaints(plain);
    expect(before.length).toBeGreaterThan(0);
    expect(new Set(before.map((t) => t.fill))).toEqual(new Set(['#ffffff']));
    expect(tagPaints(tagged).map((t) => t.fill)).toEqual(before.map(() => '#ffe0a0'));
    // Nothing else moves: the canvas and every other paint stay as they were.
    expect(tagged.replaceAll('#ffe0a0', '#ffffff')).toBe(plain);
  });

  it.each(['background', 'edgeLabelBackground', own])(
    `inks the tags of ${fixtures[0]} readably on a light %s under the dark theme`,
    async (variable) => {
      const svg = await renderTags(tagFixture(folder, fixtures[0]!), {
        theme: 'dark',
        themeVariables: { [variable]: '#fafafa' },
      });
      const found = tagPaints(svg);
      expect(found.length).toBeGreaterThan(0);
      for (const t of found) {
        expect(t.fill).toBe('#fafafa');
        if (authored.includes(t.ink)) continue;
        expect(tagContrast(t), `${t.ink} on ${t.fill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  );
}
