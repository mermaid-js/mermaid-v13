import { describe, expect, it } from 'vitest';
import { detectPipeline } from './pipeline.ts';

const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe('detectPipeline', () => {
  it('is missing while mermaid exports no render()', async () => {
    expect(await detectPipeline({})).toEqual({
      present: false,
      reason: 'mermaid exports no render()',
    });
  });

  it('is missing while render() throws or returns no <svg>', async () => {
    const throws = await detectPipeline({ render: () => Promise.reject(new Error('not yet')) });
    expect(throws).toEqual({ present: false, reason: 'render() threw: Error: not yet' });
    expect((await detectPipeline({ render: async () => ({ svg: '' }) })).present).toBe(false);
  });

  it('is present once render(id, text) resolves to a RenderResult with an <svg>', async () => {
    const calls: unknown[][] = [];
    const state = await detectPipeline({
      render: async (...args: unknown[]) => {
        calls.push(args);
        return { svg, diagramType: 'flowchart', width: 1, height: 1, warnings: [] };
      },
    });
    expect(state.present).toBe(true);
    expect(calls).toEqual([['bench-probe', 'flowchart LR\n  A --> B\n']]);
  });

  it('also finds render() on a default export object, as v12 integrators call it', async () => {
    expect((await detectPipeline({ default: { render: async () => ({ svg }) } })).present).toBe(
      true
    );
  });
});
