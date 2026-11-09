// cspell:words treemapx
import { describe, expect, it } from 'vitest';
import { detectTreemap } from './detect.ts';

/**
 * Treemap detection (#484) on header words. The parser's behaviour on whole diagrams is in the
 * conformance package (`treemap/parser.spec.ts`, over `corpus/treemap-cases.json` and the
 * `parser-*.mmd` fixtures).
 */
describe('treemap detection', () => {
  it("detects what v12's /^\\s*treemap/ did", () => {
    for (const src of ['treemap', 'treemap-beta', '  treemap', 'treemapx']) {
      expect(detectTreemap(src), src).toBe(true);
    }
    for (const src of ['Treemap', 'tree map', 'pie']) expect(detectTreemap(src), src).toBe(false);
  });
});
