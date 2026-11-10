// cspell:words eventmodeling
import { describe, expect, it } from 'vitest';
import { detectEventModeling } from './detect.ts';
import { parseEventModel } from './parser.ts';

/**
 * One-line probes of the event modeling parser's surface (#602): detection as v12's
 * `/^\s*eventmodeling/` and what the parse returns. The multi-line behaviour (model, AST,
 * symbols, messages, recovery) is checked on corpus files in
 * `packages/conformance/src/eventmodeling/` (`parser.spec.ts`, `recovery.spec.ts`,
 * `parity.spec.ts`).
 */
const errors = (src: string) =>
  parseEventModel(src).diagnostics.filter((d) => d.severity === 'error');

describe('event modeling detection', () => {
  it("is v12's case-sensitive test, with no boundary", () => {
    expect(detectEventModeling('eventmodeling')).toBe(true);
    expect(detectEventModeling('  eventmodeling')).toBe(true);
    expect(detectEventModeling('eventmodelingX')).toBe(true);
    expect(detectEventModeling('%% c\neventmodeling')).toBe(true);
    expect(detectEventModeling('---\ntitle: T\n---\neventmodeling')).toBe(true);
    expect(detectEventModeling('EventModeling')).toBe(false);
    expect(detectEventModeling('event')).toBe(false);
    expect(detectEventModeling('flowchart')).toBe(false);
  });

  it('is rejected by the parser where the grammar disagrees', () => {
    expect(errors('eventmodelingX')).toHaveLength(1);
    expect(errors('eventmodeling-beta')).toHaveLength(1);
    expect(errors('eventmodeling')).toEqual([]);
  });
});

describe('event modeling parse', () => {
  it('keeps the tokens on request', () => {
    expect(parseEventModel('eventmodeling', { keepTokens: true }).tokens?.length).toBeGreaterThan(
      0
    );
    expect(parseEventModel('eventmodeling').tokens).toBeUndefined();
  });

  it('returns a frozen-shape model for an empty diagram', () => {
    expect(parseEventModel('eventmodeling').model).toEqual({
      frames: [],
      entities: [],
      dataBlocks: [],
      notes: [],
      gwts: [],
      accTitle: '',
      accDescr: '',
      warnings: [],
    });
  });
});
