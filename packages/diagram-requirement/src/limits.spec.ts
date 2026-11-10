import { describe, expect, it } from 'vitest';
import { LimitError } from '@mermaid-js/core/limits';
import { checkStyleCopies } from './limits.ts';
import { parseRequirement } from './parser/index.ts';

/**
 * The style-copy cap (D433, R-SEC-5) in gantt's shape (D542): the parse records the overflow,
 * and `checkStyleCopies` (which the layout calls first) throws core's `LimitError`, which the
 * pipeline turns into `MermaidError { code: 'LIMIT' }`. The `render()` assertion is T5's
 * (GAPS #587).
 */
describe('the style-copy cap', () => {
  it('ends in a LimitError naming the limit, its value and the count found', () => {
    const ids = Array.from({ length: 1001 }, () => 'a').join(',');
    const classes = Array.from({ length: 1000 }, () => 'c').join(',');
    const { model, diagnostics } = parseRequirement(
      `requirementDiagram\nrequirement a {\n}\nclass ${ids} ${classes}`
    );
    expect(diagnostics).toEqual([]);
    expect(model.styleCopies?.max).toBe(1_000_000);
    let error: unknown;
    try {
      checkStyleCopies(model);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LimitError);
    expect(error).toMatchObject({
      code: 'LIMIT',
      limit: 'maxLayoutWork',
      max: 1_000_000,
      found: 1_000_001,
    });
    expect((error as LimitError).message).toMatch(/Shorten the repeated name lists/);
  });

  it('does nothing under the cap', () => {
    const { model } = parseRequirement('requirementDiagram\nrequirement a:::c {\n}\nclass a c');
    expect(model.styleCopies).toBeUndefined();
    expect(() => checkStyleCopies(model)).not.toThrow();
  });

  it('parses a class of 300,000 styles without overflowing the stack', () => {
    const src = `requirementDiagram\nelement a {\n}\n${'classDef c fill:red\n'.repeat(300_000)}class a c`;
    const { model } = parseRequirement(src);
    expect(model.elements[0]?.styles).toHaveLength(300_000);
  });
});
