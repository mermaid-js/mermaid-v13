// With the extension and real packs registered (R-SEC-2, R-ARCH-6): every flowchart fixture
// passes the allow-list, renders the same twice and through the tree writer, and its icons draw.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icons as faSolid } from '@iconify-json/fa6-solid';
import { icons as logos } from '@iconify-json/logos';
import { icons as mdi } from '@iconify-json/mdi';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError, type ExtensionPlugin, type RenderResult } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { icons } from './index.ts';

const DIAGRAMS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));
const corpus = (dir: string) =>
  readdirSync(join(DIAGRAMS, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => [`${dir}/${f}`, readFileSync(join(DIAGRAMS, dir, f), 'utf8')] as const);

async function api(extension: ExtensionPlugin = icons) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([extension]);
  // fa6-solid stands in for every Font Awesome prefix; logos (gradients) for the shapes' aws.
  m.registerIconPacks([
    { name: 'fa', icons: faSolid },
    { name: 'fas', loader: () => Promise.resolve(faSolid) },
    { name: 'fab', loader: () => Promise.resolve(mdi) },
    { name: 'aws', loader: () => Promise.resolve(logos) },
  ]);
  return m;
}

describe('the flowchart corpus with icon packs', () => {
  it('passes the allow-list, is deterministic and draws its label icons', async () => {
    const m = await api();
    const again = await api();
    // The extension's postRender hook (label colour for currentColor strokes) makes the writer
    // use its tree backing. Without the hook it streams, and must agree byte for byte: these
    // packs' label icons paint fills only, so the hook has nothing to change.
    const { postRender: _, ...streamed } = icons;
    const stream = await api(streamed);
    let withIcons = 0;
    for (const [id, source] of corpus('flowchart')) {
      let first: RenderResult;
      try {
        first = await m.render('m', source);
      } catch (e) {
        if (e instanceof MermaidError) continue; // fixtures of invalid diagrams
        throw e;
      }
      expect(
        () => assertInert(first.svg, { themeStyle: first.svg.includes('<style>') }),
        id
      ).not.toThrow();
      expect((await again.render('m', source)).svg, id).toBe(first.svg);
      expect((await stream.render('m', source)).svg, id).toBe(first.svg);
      // fa6-solid has car, server and bell; v4's `cogs` and the brands are not in it.
      if (/fa:fa-(car|server|bell)\b/.test(source)) {
        withIcons++;
        expect(first.svg, id).not.toMatch(/fa:fa-(car|server|bell)\b/);
      }
    }
    expect(withIcons).toBeGreaterThanOrEqual(40);
  }, 120_000);
});
