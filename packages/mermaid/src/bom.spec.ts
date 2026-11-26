// A byte order mark before the front matter is skipped, so `title` and `config` apply (#766,
// D642): through the public seam, the fixture with a BOM draws what it draws without one. The
// same holds for a directive line above the front matter (D704, D705).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';
import { corpusLabels, drawn } from './testing/labels.ts';

const { fixture, svgOf } = corpusLabels(readFileSync);
const BOM = '﻿';

async function withBom(path: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m.render('x', BOM + fixture(path));
}

describe('a byte order mark before front matter (#766, D642)', () => {
  it('reads the front-matter title', async () => {
    const path = 'pie/baseline/text/front-matter-title.mmd';
    const bom = await withBom(path);
    expect(drawn(bom.svg)).toContain('The front-matter title');
    expect(bom).toEqual(await svgOf(path));
  });

  it('applies the front-matter config', async () => {
    const path = 'pie/nightly-check/dark-theme.mmd';
    const bom = await withBom(path);
    expect(bom).toEqual(await svgOf(path));
    expect(bom.svg).not.toEqual((await svgOf('pie/nightly-check/default-theme.mmd')).svg);
  });
});

// A directive above the front matter (#1204, D704, D705): the front matter is read, and the
// directive still applies and wins over it, as when it is written below the fence (v12 order).
describe('a directive before front matter (#1204, D704, D705)', () => {
  const path = 'conf-and-directives/pr-check/directive-before-frontmatter.mmd';

  async function render(src: string) {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    return (await m.render('x', src)).svg;
  }

  it("draws the front-matter title in the directive's theme", async () => {
    const src = fixture(path);
    const lineEnd = src.indexOf('\n') + 1;
    const [directive, rest] = [src.slice(0, lineEnd), src.slice(lineEnd)];
    const close = rest.indexOf('\n---\n') + 5;
    const svg = await render(src);
    expect(drawn(svg)).toContain('Commented');
    // The same directive below the fence, and the same front matter with no directive (dark).
    expect(svg).toEqual(await render(rest.slice(0, close) + directive + rest.slice(close)));
    expect(svg).not.toEqual(await render(rest));
  });
});
