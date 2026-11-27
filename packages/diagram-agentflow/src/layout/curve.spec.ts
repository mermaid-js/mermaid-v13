import { describe, expect, it } from 'vitest';
import { AGENTFLOW_CURVE } from './curve.ts';

describe('agentflow default curve (D687, D733)', () => {
  it('is rounded, flowchart default: right angles with small arcs at the corners', () => {
    expect(AGENTFLOW_CURVE).toBe('rounded');
  });
});
