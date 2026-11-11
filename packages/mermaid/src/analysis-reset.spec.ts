import { describe, expect, it, vi } from 'vitest';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { createMermaid } from './slim.ts';
import { resetAnalysis } from './analysis-reset.ts';

describe('non-public analysis reset', () => {
  it('re-parses unchanged source while preserving warmed resources and configuration', async () => {
    const parse = vi.fn(flowchart.parse);
    const m = createMermaid({ diagrams: [{ ...flowchart, parse }] });
    const initialize = vi.spyOn(m, 'initialize');
    m.initialize({ theme: 'dark', maxTextSize: 10000000 });
    const source = 'flowchart LR\nA[Unchanged source]-->B';
    await m.prepare(source);
    expect(parse).toHaveBeenCalledTimes(1);
    const first = m.renderSync(source, { id: 'same' }).svg;
    expect(m.renderSync(source, { id: 'same' }).svg).toBe(first);
    expect(parse).toHaveBeenCalledTimes(1);
    resetAnalysis(m);
    expect(m.renderSync(source, { id: 'same' }).svg).toBe(first);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(m.renderSync(source, { id: 'same' }).svg).toBe(first);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect('resetAnalysis' in m).toBe(false);
  });

  it('clears only the specified instance and rejects an unknown instance', async () => {
    const source = 'graph TD\nA-->B';
    const a = createMermaid({ diagrams: [flowchart] });
    const b = createMermaid({ diagrams: [flowchart] });
    const [beforeA, beforeB] = await Promise.all([a.prepare(source), b.prepare(source)]);
    resetAnalysis(a);
    expect(await a.prepare(source)).not.toBe(beforeA);
    expect(await b.prepare(source)).toBe(beforeB);
    expect(() => resetAnalysis({})).toThrow('not registered');
  });
});
