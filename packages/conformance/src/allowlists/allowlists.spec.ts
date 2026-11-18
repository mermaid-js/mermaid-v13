/**
 * The allowlist ratchet (#695): an entry that lets a gate pass names an open issue or a decision
 * (`D<n>` in `v13/docs/DECISIONS.md`), and no list grows without one. Offline: issue states come
 * from the committed snapshot (`allowlists/issue-states.json`), which
 * `pnpm --filter @mermaid-js/conformance allowlist:issues` checks against GitHub and rewrites.
 *
 * Entries from before the rule that name neither are counted in `allowlists/baseline.json`.
 * That list only shrinks: `BASELINE_SIZE` is its size, and the only edit it takes is a lower number.
 */
import { describe, expect, it } from 'vitest';
import type { Baseline, Entry, Rules } from './allowlists.ts';
import {
  audit,
  budgetProblems,
  collectAll,
  loadBaseline,
  loadRules,
  refsIn,
  sizeBudgets,
  staleSkipRefs,
} from './allowlists.ts';

/** Only ever lower these. A new entry takes a reference, not a place in the baseline. */
const BASELINE_SIZE = { divergences: 105, skips: 79, lintDisables: 210, swimlane: 0 };

const rules: Rules = {
  decisions: new Set(['D7', 'D310']),
  open: new Set([678]),
  closed: new Set([595]),
};
const none: Baseline = { divergences: [], skips: [], swimlane: [], lintDisables: {} };
const entry = (key: string, refs: string, list: Entry['list'] = 'divergences'): Entry => ({
  list,
  key,
  file: 'a.ts',
  ...refsIn(refs),
});

describe('allowlist references', () => {
  it('reads issue numbers and decision ids, and nothing else that starts with # or D', () => {
    expect(
      refsIn('see #678 and D310 (was D7), fill:#333a, &#40;, mermaid#7183, v12 PR#12')
    ).toEqual({ issues: [678], decisions: ['D310', 'D7'] });
    expect(refsIn('')).toEqual({ issues: [], decisions: [] });
  });

  it('passes an entry that names a decision or an open issue', () => {
    expect(
      audit([entry('a', 'D7'), entry('b', '#678'), entry('c', '#595, D310')], none, rules)
    ).toEqual([]);
  });

  it('fails an entry with no reference', () => {
    expect(audit([entry('a', '')], none, rules)).toEqual([
      'divergences: a names no open issue and no decision id',
    ]);
  });

  it('fails an entry whose only issue is closed, until the entry goes or names another', () => {
    expect(audit([entry('a', '#595')], none, rules)).toEqual([
      'divergences: a names only closed issues (#595)',
    ]);
  });

  it('fails a decision id that DECISIONS.md does not have, and an issue the snapshot lacks', () => {
    expect(audit([entry('a', 'D999'), entry('b', '#4242')], none, rules)).toEqual([
      'divergences: a names D999, which v13/docs/DECISIONS.md does not have',
      'divergences: b names #4242, which allowlists/issue-states.json does not have (run allowlist:issues --write)',
    ]);
  });

  it('lets a baselined entry through, and fails a baseline entry that is no longer needed', () => {
    const baseline = { ...none, divergences: ['a', 'gone', 'fine'] };
    expect(audit([entry('a', ''), entry('fine', 'D7')], baseline, rules)).toEqual([
      'divergences: baseline lists gone, which is not an entry any more: remove it and lower BASELINE_SIZE',
      'divergences: baseline lists fine, which now names a reference: remove it and lower BASELINE_SIZE',
    ]);
  });

  it('counts unreferenced lint disables per file, so one more in a file fails', () => {
    const disables = [entry('a.ts:1', '', 'lintDisables'), entry('a.ts:9', '', 'lintDisables')];
    expect(audit(disables, { ...none, lintDisables: { 'a.ts': 2 } }, rules)).toEqual([]);
    expect(audit(disables, { ...none, lintDisables: { 'a.ts': 1 } }, rules)).toEqual([
      'lintDisables: a.ts has 2 disables without a reference, the baseline allows 1 (a.ts:1, a.ts:9)',
    ]);
    expect(audit(disables.slice(1), { ...none, lintDisables: { 'a.ts': 2 } }, rules)).toEqual([
      'lintDisables: a.ts has 1 disables without a reference, the baseline says 2: lower it and BASELINE_SIZE',
    ]);
  });

  it('fails a size budget whose decision does not state its bytes', () => {
    const text = '| D310 | **Core rises to 92 KB gz (94,208 B).** |\n| D7 | **Other.** |\n';
    const budget = (gzipBytes: number, decision?: string) => ({
      name: 'core',
      gzipBytes,
      decision,
    });
    expect(budgetProblems([budget(94208, 'D310')], text)).toEqual([]);
    expect(budgetProblems([budget(98304, 'D310')], text)).toEqual([
      'size budget core: 98,304 B is not what D310 states; a budget change cites the decision that sets it',
    ]);
    expect(budgetProblems([budget(94208)], text)).toEqual([
      'size budget core: no "decision" (the D-id that sets 94,208 B)',
    ]);
    expect(budgetProblems([budget(94208, 'D8')], text)).toEqual([
      'size budget core: D8 is not in v13/docs/DECISIONS.md',
    ]);
  });
});

describe('the committed allowlists', () => {
  const entries = collectAll();
  const baseline = loadBaseline();

  it('are all found', () => {
    const count = (list: Entry['list']) => entries.filter((e) => e.list === list).length;
    expect(count('divergences')).toBeGreaterThan(0);
    expect(count('skips')).toBeGreaterThan(0);
    expect(count('swimlane')).toBeGreaterThan(0);
    expect(count('lintDisables')).toBeGreaterThan(0);
  });

  it('name an open issue or a decision, entry by entry', () => {
    expect(audit(entries, baseline, loadRules())).toEqual([]);
  });

  it('keep no reference for a skip that is gone', () => {
    expect(staleSkipRefs(entries)).toEqual([]);
  });

  it('keep a baseline that only shrinks', () => {
    expect({
      divergences: baseline.divergences.length,
      skips: baseline.skips.length,
      swimlane: baseline.swimlane.length,
      lintDisables: Object.values(baseline.lintDisables).reduce((a, b) => a + b, 0),
    }).toEqual(BASELINE_SIZE);
  });

  it('cite, for each size budget, the decision that states it', () => {
    expect(budgetProblems(sizeBudgets())).toEqual([]);
  });
});
