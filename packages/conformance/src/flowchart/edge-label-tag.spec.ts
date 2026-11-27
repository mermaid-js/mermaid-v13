/**
 * #1345 (spec #1334): flowchart's edge-label tag reads flowchartEdgeLabelBackground (the shared
 * edgeLabelBackground unless set, D628, D715) and flowchartEdgeLabelColor (textColor where it
 * reads on the tag, D713). Swimlane draws its tags with flowchart's renderer and reads the same.
 */
import { describe, expect, it } from 'vitest';
import {
  describeTagVariables,
  diagramFixture,
  renderTags,
  tagPaints,
} from '../edge-label-tag-paint.ts';

describe('the flowchart edge-label tag (#1345, D713, D715)', () => {
  describeTagVariables('flowchart', 'flowchart', ['tags', 'tags-in-container']);
});

describe('the swimlane edge-label tag (#1345)', () => {
  describeTagVariables('flowchart', 'swimlanes', ['tags', 'tags-in-container']);
});

describe("an edge's own label colour (#1345, D713)", () => {
  it('wins as written over the tag ink, with no contrast check', async () => {
    const source = diagramFixture(
      'flowchart/visual-check/27-set-text-color-of-nodes-and-links-according-to-styles-when-html-labels-are-disabled.mmd'
    );
    // `linkStyle 0 color:red`, `linkStyle 1 … color:#0000ff`, `linkStyle default color:Sienna`.
    const plain = tagPaints(await renderTags(source)).map((t) => t.ink);
    expect(plain).toEqual(['#ff0000', '#0000ff', '#a0522d']);
    const dark = await renderTags(source, {
      themeVariables: { flowchartEdgeLabelColor: '#fefefe' },
    });
    expect(tagPaints(dark).map((t) => t.ink)).toEqual(plain);
  });
});
