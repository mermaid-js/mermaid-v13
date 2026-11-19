import { describe, expect, it } from 'vitest';
import { reportJson } from './report-json.ts';

describe('reportJson (#847)', () => {
  it('writes lone surrogates as visible text, so strict JSON readers accept the file', () => {
    const json = reportJson({ clusters: [{ examples: ['a\ud800b\udc00c'] }] }, 2);
    expect(json).not.toMatch(/(?<!\\)\\ud[89a-f]/i); // no JSON surrogate escape
    expect(JSON.parse(json)).toEqual({ clusters: [{ examples: ['a\\uD800b\\uDC00c'] }] });
  });

  it('leaves paired surrogates and other text alone', () => {
    const value = { source: 'flowchart TD\n  A["😀 é"] --> B', count: 3, list: ['x'] };
    expect(reportJson(value, 2)).toBe(JSON.stringify(value, null, 2));
  });
});
