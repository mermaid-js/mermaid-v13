// cspell:words betax notebook buyer
import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { detectWardley } from './detect.ts';
import { parseWardley } from './parser.ts';
import { T } from './tokens.ts';

/**
 * One-line probes of the wardley parser's surface (#489): detection as v12's
 * `/^\s*wardley-beta/i`, the D423 message, the preprocess option and the probe hook. The
 * multi-line behaviour (model, AST, symbols, recovery) is checked on corpus files in
 * `packages/conformance/src/wardley/` (`parser.spec.ts`, `recovery.spec.ts`, `parity.spec.ts`).
 */
const errors = (src: string) =>
  parseWardley(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.message);

describe('wardley detection', () => {
  it("is v12's case-insensitive test after front matter, directives and comments", () => {
    expect(detectWardley('wardley-beta')).toBe(true);
    expect(detectWardley('  Wardley-Beta\ncomponent A [0.5, 0.5]')).toBe(true);
    expect(detectWardley('wardley-betax')).toBe(true);
    expect(detectWardley('%%{init: {}}%%\n%% c\nwardley-beta')).toBe(true);
    expect(detectWardley('---\ntitle: T\n---\nwardley-beta')).toBe(true);
    expect(detectWardley('wardley')).toBe(false);
    expect(detectWardley('wardley-bet')).toBe(false);
    expect(detectWardley('flowchart')).toBe(false);
  });

  it('rejects what it detects but the grammar does not', () => {
    expect(errors('Wardley-Beta')).toHaveLength(1);
    expect(errors('wardley-betax')).toHaveLength(1);
    expect(errors('wardley-beta')).toEqual([]);
  });
});

describe('wardley parse', () => {
  it('never throws, and keeps the preprocess diagnostics unless they are handed in', () => {
    const src = '%%{ never closed\nwardley-beta';
    const pre = preprocess(src);
    expect(pre.diagnostics.length).toBeGreaterThan(0);
    expect(parseWardley(src).diagnostics.length).toBeGreaterThan(
      parseWardley(src, { preprocessed: pre }).diagnostics.length
    );
  });

  it('says a name starts with a keyword and how to quote it (D423)', () => {
    expect(errors('wardley-beta\ncomponent notebook [0.5, 0.5]')).toEqual([
      'Expected a name such as `Tea` or `"Hot water"`, got `note`; `notebook` starts with the keyword `note`, and an unquoted name cannot be or start with one: quote it, as `"notebook"`.',
    ]);
    expect(errors('wardley-beta\nbuyer -> Tea')[0]).toContain(
      '`buyer` starts with the keyword `buy`'
    );
    expect(errors('wardley-beta\nTea -> component')[0]).toContain(
      '`component` is a keyword, and an unquoted name cannot be or start with one: quote it, as `"component"`'
    );
  });

  it('records what the parser expects at a probe offset', () => {
    const src = 'wardley-beta\ncomponent A [0.5, 0.5] ';
    const { probe } = parseWardley(src, { probe: src.length });
    expect(probe?.expected).toEqual(expect.arrayContaining([T.Label, T.LParen, T.Inertia]));
    const title = 'wardley-beta\ntitle Hel';
    expect(parseWardley(title, { probe: title.length }).probe?.mode).toBe('title');
  });

  it('keeps the tokens on request', () => {
    expect(parseWardley('wardley-beta', { keepTokens: true }).tokens?.length).toBeGreaterThan(0);
  });
});
