// An ER attribute's generic type named like an HTML tag is drawn as written (#945, as class
// does since D619): through the public seam, with no HTML_DROPPED warning.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusLabels, drawn } from './testing/labels.ts';

const { svgOf, textOf } = corpusLabels(readFileSync);
const FIXTURE = 'er-diagram/baseline/attributes/generics-named-like-html.mmd';

describe('ER generics named like HTML tags (#945)', () => {
  it('draws each generic type as written', async () => {
    const { svg } = await svgOf(FIXTURE);
    expect(drawn(svg)).toEqual(
      expect.arrayContaining(['List<Data>', 'string<U>', 'List<T>', 'Map<K, B>'])
    );
  });

  it('raises no warning, HTML_DROPPED included', async () => {
    const { warnings } = await svgOf(FIXTURE);
    expect(warnings).toEqual([]);
  });

  it('writes the same types in text output', async () => {
    const { text, warnings } = await textOf(FIXTURE);
    for (const t of ['List<Data>', 'string<U>', 'List<T>', 'Map<K, B>']) expect(text).toContain(t);
    expect(warnings).toEqual([]);
  });
});
