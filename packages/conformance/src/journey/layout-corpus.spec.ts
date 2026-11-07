import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { DIAGRAM_TABLES } from '../diagram-themes.ts';
import { journeyLayoutViolations, layoutJourney, parseJourney } from '@mermaid-js/diagram-journey';
import type { CorpusItem } from '../types.ts';
import { journeyGrammarCorpus } from './corpus.ts';

/**
 * The journey layout's invariants (`journeyLayoutViolations`, #303) on models the v13 parser
 * produced (#302): every source of the gate corpus (the e2e files themselves, the v12 spec
 * strings, the edge and parser cases, each also with CRLF and comment lines; the
 * every-code-unit sources left out), rejected ones included (the model of what parsed), in the
 * default and redux themes, with the file's front-matter `journey` config and with every length
 * changed (as `src/layout/layout.spec.ts` does for its fixtures).
 */
const THEMES = ['default', 'redux'] as const;
const LENGTHS = {
  diagramMarginX: 20,
  diagramMarginY: 30,
  leftMargin: 90,
  maxLabelWidth: 80,
  width: 110,
  height: 70,
  taskMargin: 15,
  boxTextMargin: 12,
  taskFontSize: 20,
};

const specs = new Map<string, ThemeSpec>();
let corpus: CorpusItem[];
beforeAll(async () => {
  for (const name of THEMES) specs.set(name, await loadTheme(name));
  corpus = await journeyGrammarCorpus();
});

describe('journey layout invariants on parsed models', () => {
  it('hold over the corpus, both themes, the file config and every length changed', () => {
    const failures: string[] = [];
    let tasks = 0;
    for (const item of corpus) {
      const pre = preprocess(item.source);
      const { model } = parseJourney(item.source, { preprocessed: pre });
      const own = (pre.frontMatter?.config?.journey ?? {}) as Record<string, unknown>;
      tasks += model.tasks.length;
      for (const theme of THEMES) {
        for (const extra of [{}, LENGTHS]) {
          const layout = layoutJourney(model, {
            config: { journey: { ...own, ...extra } } as unknown as ResolvedConfig,
            measurer: tableMeasurer,
            theme: createTheme(specs.get(theme) as ThemeSpec, { diagram: DIAGRAM_TABLES.journey }),
            warn: () => {},
          });
          const v = journeyLayoutViolations(model, layout);
          if (v.length > 0)
            failures.push(`${item.id} ${theme} ${JSON.stringify(extra)}: ${v.join('; ')}`);
        }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(35);
    expect(tasks).toBeGreaterThan(500);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
