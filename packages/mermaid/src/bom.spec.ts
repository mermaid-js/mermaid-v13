// A byte order mark before the front matter is skipped, so `title` and `config` apply (#766,
// D642): through the public seam, the fixture with a BOM draws what it draws without one.
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
