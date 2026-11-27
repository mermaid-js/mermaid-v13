import { describe, expect, it } from 'vitest';
import type { InstructionDiagram } from './instruction-counts.ts';
import { countChange, medianCount } from './instruction-counts.ts';

const diagram = (counts: InstructionDiagram['counts']): InstructionDiagram => ({
  id: 'd',
  label: 'd',
  measured: 10,
  counts,
});

describe('instruction count statistics', () => {
  it('takes the median of the repeats that counted', () => {
    expect(medianCount(diagram({ v13: [3, null, 1, 2] }), 'v13')).toBe(2);
    expect(medianCount(diagram({ v13: [null] }), 'v13')).toBeNull();
    expect(medianCount(diagram({}), 'compare')).toBeNull();
  });

  it('pairs repeats: the change is the median of per-repeat ratios, with their range', () => {
    const d = diagram({ v13: [110, 102, 105], 'v13-base': [100, 100, 100] });
    const c = countChange(d, 'v13', 'v13-base')!;
    expect(c.change).toBeCloseTo(0.05, 6);
    expect(c.low).toBeCloseTo(0.02, 6);
    expect(c.high).toBeCloseTo(0.1, 6);
  });

  it('skips repeats either side missed, and gives null when none pair', () => {
    expect(
      countChange(diagram({ v13: [101, null], 'v13-base': [100, 100] }), 'v13', 'v13-base')!.change
    ).toBeCloseTo(0.01, 6);
    expect(countChange(diagram({ v13: [null], 'v13-base': [100] }), 'v13', 'v13-base')).toBeNull();
  });
});
