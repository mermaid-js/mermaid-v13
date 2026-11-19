/**
 * #764, D643: v12's deprecated `getRegisteredDiagramsMetadata()` lists the detectors in v12's
 * order, `error` and `---` first. v13 lists the same ids in the same order, plus the types only
 * v13 has, in their detection slots.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { loadOracle } from './oracle.ts';

await loadOracle();
const v12 = (
  (await import('mermaid-v12')) as unknown as {
    default: { getRegisteredDiagramsMetadata(): { id: string }[] };
  }
).default;

/** First-party types v12 12.2.0 does not have. */
const V13_ONLY = ['c4beta'];

describe('getRegisteredDiagramsMetadata against mermaid@12 (#764, D643)', () => {
  it("lists v12's detector ids in v12's order", () => {
    const want = v12.getRegisteredDiagramsMetadata().map((d) => d.id);
    const got = createMermaid()
      .getRegisteredDiagramsMetadata()
      .map((d) => d.id);
    expect(got.filter((id) => !V13_ONLY.includes(id))).toEqual(want);
    expect(got.filter((id) => !want.includes(id))).toEqual(V13_ONLY);
  });
});
