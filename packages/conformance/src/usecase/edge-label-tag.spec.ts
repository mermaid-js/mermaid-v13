/**
 * #1350 (spec #1334): usecase's edge-label tag reads usecaseEdgeLabelBackground (the shared
 * edgeLabelBackground unless set, D628, D715) and usecaseEdgeLabelColor (textColor where it reads
 * on the tag, D713).
 */
import { describe } from 'vitest';
import { describeTagVariables } from '../edge-label-tag-paint.ts';

describe('the usecase edge-label tag (#1350, D713, D715)', () => {
  describeTagVariables('usecase', 'usecase', ['tags', 'tags-in-container']);
});
