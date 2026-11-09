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
});
