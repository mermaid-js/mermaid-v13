// A class generic named like an HTML tag is drawn as written (#756, D619): through the public
// seam, in a title and in a member, with no HTML_DROPPED warning.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusLabels, drawn } from './testing/labels.ts';

const { svgOf } = corpusLabels(readFileSync);
const FIXTURE = 'class-diagram/baseline/classes/generics-named-like-html.mmd';

describe('class generics named like HTML tags (#756, D619)', () => {
  it('draws each generic as written, in titles and members', async () => {
    const { svg } = await svgOf(FIXTURE);
    expect(drawn(svg).sort()).toEqual(
      [
        'A',
        'B<U>',
        'Bold<B>',
        'C<I>',
        'Box<Button>',
        '+List<Data> items',
        '+get(Map<K, Option> m) : Box<Form>',
      ].sort()
    );
  });

  it('raises no warning, HTML_DROPPED included', async () => {
    const { warnings } = await svgOf(FIXTURE);
    expect(warnings).toEqual([]);
  });
});
