import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { diffPaths } from '../runner.ts';
import { loadOracle } from '../oracle.ts';
import { gitGraphCorpus } from './corpus.ts';
import { gitGraphV12Snapshot } from './v12.ts';
import { gitGraphV13Snapshot, parseGitGraphForParity } from './v13.ts';
import type { GitParityConfig } from './v13.ts';

/**
 * Model parity under the two config keys the model reads, `mainBranchName` and
 * `mainBranchOrder` (#370). The oracle never applies a diagram's own front matter or `init`
 * directive, so the main suite compares both sides with the defaults; here the e2e fixtures and
 * spec strings that set either key, and a few cases, run with that config as the site config of
 * v12 and the parse options of v13.
 */
function configOf(text: string): GitParityConfig | undefined {
  const pre = preprocess(text);
  const sections = [
    pre.frontMatter?.config?.gitGraph,
    ...pre.directives.map((d) => (d.args as { gitGraph?: unknown } | undefined)?.gitGraph),
  ];
  const out: GitParityConfig = {};
  for (const s of sections) {
    if (typeof s !== 'object' || s === null) continue;
    const { mainBranchName, mainBranchOrder } = s as Record<string, unknown>;
    if (typeof mainBranchName === 'string') out.mainBranchName = mainBranchName;
    if (typeof mainBranchOrder === 'number') out.mainBranchOrder = mainBranchOrder;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const CASES: [string, GitParityConfig][] = [
  ['gitGraph\ncommit\nbranch a\ncommit\ncheckout trunk\nmerge a', { mainBranchName: 'trunk' }],
  ['gitGraph\ncommit\ncheckout main', { mainBranchName: 'trunk' }],
  ['gitGraph\ncommit\nbranch a\nbranch b order:1\nbranch c', { mainBranchOrder: 2 }],
  ['gitGraph\ncommit\nbranch x order:3\nbranch y order:1', { mainBranchOrder: 0 }],
  ['gitGraph\ncommit\nbranch trunk', { mainBranchName: 'trunk', mainBranchOrder: 5 }],
];

describe('gitGraph oracle parity under mainBranchName and mainBranchOrder', () => {
  it('matches accept/reject and the model with the config each source sets', async () => {
    const oracle = await loadOracle();
    const items: [string, string, GitParityConfig][] = [];
    for (const item of await gitGraphCorpus()) {
      const config = configOf(item.source);
      if (config) items.push([item.id, item.source, config]);
    }
    // The e2e fixtures with `mainBranchName` / `mainBranchOrder` (7 and 7, some both).
    expect(items.length).toBeGreaterThanOrEqual(7);
    CASES.forEach(([source, config], k) => items.push([`case ${k}`, source, config]));
    const diffs: string[] = [];
    let accepted = 0;
    for (const [id, source, config] of items) {
      const v12 = await oracle.parse(source, { gitGraph: config });
      let v13: ReturnType<typeof gitGraphV13Snapshot> | undefined;
      let error = '';
      try {
        v13 = gitGraphV13Snapshot(parseGitGraphForParity(source, config));
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      if (v12.accepted !== (v13 !== undefined)) {
        diffs.push(
          `${id}: v12 ${v12.accepted ? 'accepts' : v12.error}, v13 ${v13 ? 'accepts' : error}`
        );
        continue;
      }
      if (!v12.accepted || !v13) continue;
      accepted++;
      const paths = diffPaths(gitGraphV12Snapshot(v12.db), v13);
      if (paths.length > 0) diffs.push(`${id}: ${paths.join(', ')}`);
    }
    expect(diffs).toEqual([]);
    expect(accepted).toBeGreaterThanOrEqual(10);
  }, 120_000);
});
