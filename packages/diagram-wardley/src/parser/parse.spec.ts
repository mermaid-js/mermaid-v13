// cspell:words betax
import { describe, expect, it } from 'vitest';
import { detectWardley } from './detect.ts';
import { parseWardley } from './parser.ts';

/**
 * One-line probes of the wardley parser's surface (#489): detection as v12's
 * `/^\s*wardley-beta/i` and what the parse returns. The multi-line behaviour (model, AST,
 * symbols, messages, recovery, the probe) is checked on corpus files in
 * `packages/conformance/src/wardley/` (`parser.spec.ts`, `recovery.spec.ts`, `parity.spec.ts`).
 */
const errors = (src: string) => parseWardley(src).diagnostics.filter((d) => d.severity === 'error');

describe('wardley detection', () => {
  it("is v12's case-insensitive test, with no boundary", () => {
    expect(detectWardley('wardley-beta')).toBe(true);
    expect(detectWardley('  Wardley-Beta')).toBe(true);
    expect(detectWardley('wardley-betax')).toBe(true);
    expect(detectWardley('%% c\nwardley-beta')).toBe(true);
    expect(detectWardley('wardley')).toBe(false);
    expect(detectWardley('wardley-bet')).toBe(false);
    expect(detectWardley('flowchart')).toBe(false);
  });

  it('is rejected by the parser where the grammar disagrees', () => {
    expect(errors('Wardley-Beta')).toHaveLength(1);
    expect(errors('wardley-betax')).toHaveLength(1);
    expect(errors('wardley-beta')).toEqual([]);
  });
});

describe('wardley parse', () => {
  it('keeps the tokens on request', () => {
    expect(parseWardley('wardley-beta', { keepTokens: true }).tokens?.length).toBeGreaterThan(0);
    expect(parseWardley('wardley-beta').tokens).toBeUndefined();
  });

  it("decodes v12's #name; codes as v12 drew them and keeps a literal &name; (GAPS #493)", () => {
    const { model } = parseWardley(
      [
        'wardley-beta',
        'title A #amp; B &amp; C',
        'component "Tea #amp; &amp; #quot;Cups#quot;" [0.5, 0.5]',
        'component "X #y; #9829; #x41;" [0.1, 0.1]',
        'note "#9829; love &lt;3" [0.1, 0.2]',
        '"Tea #amp; &amp; #quot;Cups#quot;" -> "X #y; #9829; #x41;" ; a #lt; b &gt; c',
      ].join('\n')
    );
    expect(model.title).toBe('A & B &amp; C');
    expect(model.nodes.map((n) => n.label)).toEqual(['Tea & &amp; "Cups"', 'X &y; ♥ &x41;']);
    expect(model.notes[0]!.text).toBe('♥ love &lt;3');
    expect(model.links[0]).toMatchObject({
      source: 'Tea & &amp; "Cups"',
      target: 'X &y; ♥ &x41;',
      label: 'a < b &gt; c',
    });
    // An `&` in a comment inside the range is dropped with the comment.
    const block = parseWardley('wardley-beta\naccDescr {\n a #amp; b\n%% c & d\n e &amp;\n}');
    expect(block.model.accDescr).toBe('a & b\ne &amp;');
  });
});
