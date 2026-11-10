import { describe, expect, it } from 'vitest';
import { withStubDocument } from './oracle-env.ts';

describe('event modeling oracle environment', () => {
  it('puts back no `document` where there was none', () => {
    const g = globalThis as Record<string, unknown>;
    expect('document' in g).toBe(false);
    expect(withStubDocument(() => typeof g.document)).toBe('object');
    expect('document' in g).toBe(false);
  });
});
