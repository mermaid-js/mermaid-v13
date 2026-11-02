import { describe, expect, it } from 'vitest';
import { runParity } from '../runner.ts';
import { PARITY_SUITES } from '../registry.ts';
import { FUZZ_DECISIONS } from './decided.ts';

describe('decided fuzz-only divergences from mermaid@12', () => {
  it('each example still diverges in the decided way', async () => {
    const report = await runParity({
      adapters: PARITY_SUITES.map((s) => s.adapter),
      corpus: FUZZ_DECISIONS.map((d) => ({ id: d.id, source: d.source })),
    });
    const observed = Object.fromEntries(
      report.results.map((r) => [r.id, r.divergence?.kind ?? r.status])
    );
    const decided = Object.fromEntries(FUZZ_DECISIONS.map((d) => [d.id, d.kind]));
    expect(observed).toEqual(decided);
  }, 60_000);

  it('ids are unique and every decision has a reason', () => {
    expect(new Set(FUZZ_DECISIONS.map((d) => d.id)).size).toBe(FUZZ_DECISIONS.length);
    for (const d of FUZZ_DECISIONS) expect(d.reason.length, d.id).toBeGreaterThan(40);
  });
});
