/**
 * #1349 (spec #1334): block's edge-label tag reads blockEdgeLabelBackground (the shared
 * edgeLabelBackground unless set, D628, D715) and blockEdgeLabelColor (textColor where it reads
 * on the tag, D713).
 */
import { describe } from 'vitest';
import { describeTagVariables } from '../edge-label-tag-paint.ts';

describe('the block edge-label tag (#1349, D713, D715)', () => {
  describeTagVariables('block', 'block', ['tags', 'tags-in-container']);
});
