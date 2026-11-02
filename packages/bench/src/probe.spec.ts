import { describe, expect, it } from 'vitest';
import * as mermaid from 'mermaid';
import { detectPipeline } from './pipeline.ts';

describe('the bench probe against the real mermaid package', () => {
  it('finds the pipeline, so the gates enforce', async () => {
    expect(await detectPipeline(mermaid)).toEqual({
      present: true,
      reason: 'render() turned a two-node flowchart into an <svg>',
    });
  });
});
