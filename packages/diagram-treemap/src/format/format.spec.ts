import { describe, expect, it } from 'vitest';
import { d3Format, treemapValueFormat } from './index.ts';

// Worked examples from d3-format's README (the full table against d3 itself is
// `packages/conformance/src/treemap/value-format.spec.ts`).
describe('d3Format', () => {
  it.each([
    ['.0%', 0.123, '12%'],
    ['($.2f', -3.5, '($3.50)'],
    ['+20', 42, '                 +42'],
    ['.^20', 42, '.........42.........'],
    ['.2s', 42e6, '42M'],
    ['#x', 48879, '0xbeef'],
    [',.2r', 4223, '4,200'],
    ['.3~s', 1500, '1.5k'],
    ['', 0.1 + 0.2, '0.3'],
    [',', -1234.5, '−1,234.5'],
    ['08,d', 1234, '0,001,234'],
  ])('%j formats %d as %j', (specifier, value, text) => {
    expect(d3Format(specifier)!(value)).toBe(text);
  });

  it('rejects what d3 rejects', () => {
    expect(d3Format('abc')).toBeUndefined();
    expect(d3Format(',.2f ')).toBeUndefined();
  });
});

describe('treemapValueFormat (v12 renderer.ts:50-77)', () => {
  it.each([
    ['$0,0', 1234567, '$1,234,567'],
    ['$,.2f', 1234.5, '$1.2e+3'],
    ['$.2f', 1234.5, '$1234.50'],
    ['.1%', 0.256, '25.6%'],
    ['nope', 1234, '1,234'],
    ['$nope', 1234, '1,234'],
  ])('%j formats %d as %j', (specifier, value, text) => {
    expect(treemapValueFormat(specifier)(value)).toBe(text);
  });
});
