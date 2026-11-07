import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme, type ThemeSpec } from '@mermaid-js/core/theme';
import {
  gitGraph as plugin,
  layoutGitGraph,
  parseGitGraph,
  type GitDirection,
} from '@mermaid-js/diagram-gitgraph';
import { gitLayoutViolations } from '@mermaid-js/diagram-gitgraph/testing';
import type { CorpusItem } from '../types.ts';
import { gitGraphGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (spec #292 T3, #371's first criterion): every
 * source of the gitGraph gate corpus (e2e fixtures, v12 spec strings, quirks and parser cases,
 * each also CRLF and commented), rejected sources included (the model of what parsed), laid
 * out LR, TB and BT, with `parallelCommits` off and on, classic and redux geometry, with the
 * default config and with `showBranches`, `rotateCommitLabel` and `showCommitLabel` turned off,
 * gives no `gitLayoutViolations`. Redux geometry is the `redux` theme's (#374).
 */
const DIRECTIONS: readonly GitDirection[] = ['LR', 'TB', 'BT'];
const CONFIGS = [
  {},
  { showBranches: false, rotateCommitLabel: false, showCommitLabel: false },
] as const;

const themes: { name: string; theme: () => Theme }[] = [];
let corpus: CorpusItem[];
beforeAll(async () => {
  const classic: ThemeSpec = await loadTheme('default');
  const redux: ThemeSpec = await loadTheme('redux');
  themes.push(
    { name: 'classic', theme: () => createTheme(classic, { diagram: plugin.theme }) },
    { name: 'redux', theme: () => createTheme(redux, { diagram: plugin.theme }) }
  );
  corpus = await gitGraphGateCorpus();
});

describe('gitGraph layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus, every direction, parallel on and off, both geometries and option sets', () => {
    const failures: string[] = [];
    let commits = 0;
    for (const item of corpus) {
      const { model } = parseGitGraph(item.source);
      commits += model.commits.length;
      for (const direction of DIRECTIONS) {
        const m = { ...model, direction };
        for (const { name, theme } of themes)
          for (const parallelCommits of [false, true])
            for (const options of CONFIGS) {
              const gitGraph = { ...options, parallelCommits };
              const layout = layoutGitGraph(m, {
                config: { gitGraph } as unknown as ResolvedConfig,
                measurer: tableMeasurer,
                theme: theme(),
              });
              const v = gitLayoutViolations(m, layout, { parallelCommits });
              if (v.length > 0)
                failures.push(
                  `${item.id} ${direction} ${name} ${JSON.stringify(gitGraph)}: ${v.join('; ')}`
                );
            }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(197);
    expect(commits).toBeGreaterThan(4000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
