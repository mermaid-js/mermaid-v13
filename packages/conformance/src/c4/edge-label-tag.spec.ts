/**
 * #1351 (spec #1334): C4's and c4-beta's relation-label tag reads c4EdgeLabelBackground (the
 * shared edgeLabelBackground unless set, D628, D715) and c4EdgeLabelColor (textColor where it
 * reads on the tag, D713, D714). A relation's own text colour wins as written.
 */
import { describe, expect, it } from 'vitest';
import {
  describeTagVariables,
  diagramFixture,
  renderTags,
  tagPaints,
} from '../edge-label-tag-paint.ts';

describe('the C4 relation-label tag (#1351, D713, D714, D715)', () => {
  // The fourth relation's `$textColor="#d6336c"` is the author's, drawn as written.
  describeTagVariables('c4', 'c4', ['tags'], ['#d6336c']);
});

describe('the c4-beta relation-label tag (#1351, D713, D714, D715)', () => {
  describeTagVariables('c4', 'c4beta', ['tags']);
});

describe("a relation's own text colour (#1351, D713)", () => {
  const OWN = { theme: 'dark', themeVariables: { c4EdgeLabelColor: '#fefefe' } };

  it('UpdateRelStyle $textColor wins as written over the tag ink, with no contrast check', async () => {
    // The fourth relation is `UpdateRelStyle(d, e, $lineColor="#d6336c", $textColor="#d6336c")`.
    const source = diagramFixture('c4/baseline/edge-labels/tags.mmd');
    // The default theme is redux-color, whose textColor is #28253d.
    expect(tagPaints(await renderTags(source)).map((t) => t.ink)).toEqual([
      '#28253d',
      '#28253d',
      '#28253d',
      '#d6336c',
    ]);
    expect(tagPaints(await renderTags(source, OWN)).map((t) => t.ink)).toEqual([
      '#fefefe',
      '#fefefe',
      '#fefefe',
      '#d6336c',
    ]);
  });

  it('a c4-beta style color wins as written over the tag ink', async () => {
    // `:::slow` colours its text #9a3412; the other two relations take the tag ink.
    const source = diagramFixture('c4beta/pr-check/tag-styles.mmd');
    expect(tagPaints(await renderTags(source, OWN)).map((t) => t.ink)).toEqual([
      '#fefefe',
      '#9a3412',
      '#9a3412',
      '#fefefe',
    ]);
  });
});
