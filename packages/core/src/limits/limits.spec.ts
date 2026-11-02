import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMITS,
  LIMIT_CODES,
  LimitError,
  asLimitError,
  checkOutput,
  checkSource,
  isLimitCode,
  resolveLimits,
} from './index.ts';

describe('DEFAULT_LIMITS (R-SEC-5, D31)', () => {
  it('are 50,000 source characters and 5,000 edges, plus node, depth and output caps', () => {
    expect(DEFAULT_LIMITS).toEqual({
      maxSourceLength: 50_000,
      maxEdges: 5_000,
      maxNodes: 10_000,
      maxDepth: 100,
      maxOutputLength: 4_000_000,
    });
    expect(Object.isFrozen(DEFAULT_LIMITS)).toBe(true);
  });
});

describe('resolveLimits', () => {
  it('takes the defaults when the integrator sets nothing', () => {
    expect(resolveLimits()).toEqual(DEFAULT_LIMITS);
  });

  it("maps v12's integrator keys maxTextSize and maxEdges onto the limits", () => {
    expect(resolveLimits({ maxTextSize: 10, maxEdges: 3 })).toMatchObject({
      maxSourceLength: 10,
      maxEdges: 3,
    });
  });

  it('lets explicit limits win over the v12 keys, and allows Infinity', () => {
    const limits = resolveLimits({ maxEdges: 3 }, { maxEdges: Infinity, maxDepth: 7 });
    expect(limits.maxEdges).toBe(Infinity);
    expect(limits.maxDepth).toBe(7);
    expect(Object.isFrozen(limits)).toBe(true);
  });

  it('rejects a limit that is not a non-negative number', () => {
    expect(() => resolveLimits(undefined, { maxNodes: -1 })).toThrow(TypeError);
    expect(() => resolveLimits(undefined, { maxNodes: Number.NaN })).toThrow(TypeError);
    expect(() => resolveLimits({ maxEdges: '9' as unknown as number })).toThrow(TypeError);
  });

  it('ignores unknown and prototype keys in the overrides', () => {
    const hostile = JSON.parse('{"__proto__": {"maxEdges": 1}, "other": 1}') as object;
    expect(resolveLimits(undefined, hostile)).toEqual(DEFAULT_LIMITS);
  });
});

describe('checkSource / checkOutput', () => {
  const limits = resolveLimits(undefined, { maxSourceLength: 5, maxOutputLength: 8 });

  it('accept text up to the limit', () => {
    expect(() => checkSource('12345', limits)).not.toThrow();
    expect(() => checkOutput('<svg/>xx', limits)).not.toThrow();
  });

  it('throw a LimitError, a RangeError, naming the limit, its value and the size found', () => {
    let error: unknown;
    try {
      checkSource('123456', limits);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LimitError);
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({
      code: 'LIMIT',
      limit: 'maxSourceLength',
      max: 5,
      found: 6,
      message:
        'The diagram text is 6 characters long, over the limit of 5. The limit is set by the page or app that renders the diagram (maxTextSize).',
    });
    expect(() => checkOutput('<svg>…</svg>', limits)).toThrow(
      'The rendered SVG is 12 characters long, over the limit of 8.'
    );
  });
});

describe('limit diagnostics and thrown errors', () => {
  it('give each limit one diagnostic code', () => {
    expect(LIMIT_CODES).toEqual({
      maxSourceLength: 'SOURCE_LIMIT',
      maxEdges: 'EDGE_LIMIT',
      maxNodes: 'NODE_LIMIT',
      maxDepth: 'DEPTH_LIMIT',
      maxOutputLength: 'OUTPUT_LIMIT',
    });
    expect(isLimitCode('EDGE_LIMIT')).toBe(true);
    expect(isLimitCode('UNEXPECTED')).toBe(false);
  });

  it('asLimitError keeps a LimitError and turns a stack overflow into a depth limit', () => {
    const own = new LimitError('maxEdges', 1, 2, 'x');
    expect(asLimitError(own)).toBe(own);
    const overflow = (n: number): number => overflow(n + 1) + 1;
    let thrown: unknown;
    try {
      overflow(0);
    } catch (e) {
      thrown = e;
    }
    expect(asLimitError(thrown)).toMatchObject({ code: 'LIMIT', limit: 'maxDepth' });
  });

  it('asLimitError leaves other errors alone, including other RangeErrors', () => {
    expect(asLimitError(new RangeError('NaN is not a coordinate'))).toBeUndefined();
    expect(asLimitError(new TypeError('x'))).toBeUndefined();
    expect(asLimitError('text')).toBeUndefined();
  });
});
