import { describe, expect, it } from 'vitest';
import elkLayouts from '@mermaid-js/layout-elk';
import { devLayoutLoaders, devLayouts } from './mermaid.ts';

describe('dev build layouts', () => {
  it('registers ELK layouts and lists them in the explorer', () => {
    const elkNames = elkLayouts.map(({ name }) => name);

    expect(devLayoutLoaders).toEqual(elkLayouts);
    expect(devLayouts).toEqual(['layered', ...elkNames]);
    expect(devLayouts).toContain('elk.stress');
    expect(devLayouts).toContain('elk.radial');
  });
});
