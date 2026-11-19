// An ER attribute type with a generic named like an HTML tag is drawn as written (#945), as
// v12's `erBox` drew it and as class does since D619: no HTML_DROPPED warning.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusLabels, drawn } from './testing/labels.ts';

const { svgOf, textOf } = corpusLabels(readFileSync);
const FIXTURE = 'er-diagram/nightly-check/attribute-generics-named-like-html.mmd';

describe('ER generics named like HTML tags (#945, D619)', () => {
  it('draws each attribute type as written', async () => {
    const { svg } = await svgOf(FIXTURE);
    expect(drawn(svg)).toEqual(
      expect.arrayContaining(['List<Data>', 'string<U>', 'Map<K,Option>', 'Box<B>', 'List<T>'])
    );
    expect(drawn(svg)).not.toContain('List');
  });

  it('raises no warning, HTML_DROPPED included', async () => {
    const { warnings } = await svgOf(FIXTURE);
    expect(warnings).toEqual([]);
  });

  it('writes the same types in text output, with no warning', async () => {
    const { text, warnings } = await textOf(FIXTURE);
    for (const type of ['List<Data>', 'string<U>', 'Map<K,Option>', 'Box<B>', 'List<T>'])
      expect(text).toContain(type);
    expect(warnings).toEqual([]);
  });
});
