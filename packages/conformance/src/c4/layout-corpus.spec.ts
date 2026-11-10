import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutC4 } from '@mermaid-js/diagram-c4';
import { c4LayoutViolations, c4TestContext, parsedC4 } from '@mermaid-js/diagram-c4/testing';
import type { CorpusItem } from '../types.ts';
import { c4GateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, spec #522 T3): every source of the
 * C4 gate corpus (e2e fixtures, v12 spec and syntax-page strings, the cases, each in every
 * variant), parsed by the v13 parser, rejected sources included (the model of what parsed), laid
 * out under four `c4` configs, gives no `c4LayoutViolations`: no NaN; elements apart and inside
 * their boundary below its header; boundaries inside their parent, siblings apart, headers in
 * their frames; relation ends on their shapes' outlines; everything inside the bounds, and the
 * bounds inside the canvas. Crossings are pinned on the e2e fixtures in the package's spec.
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { c4ShapeInRow: 1, c4BoundaryInRow: 1, wrap: false },
  {
    c4ShapeMargin: 0,
    c4ShapePadding: 0,
    width: 0,
    diagramMarginX: 0,
    diagramMarginY: 0,
    nextLinePaddingX: -40,
  },
  {
    c4ShapeMargin: 'x',
    width: Number.NaN,
    c4ShapeInRow: 0,
    c4BoundaryInRow: 2.5,
    personFontSize: '2em',
  },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
  corpus = await c4GateCorpus();
});

describe('c4 layout invariants on parser-produced fixtures', () => {
  it('hold over the gate corpus at every config, the root wrap on and off', () => {
    const failures: string[] = [];
    let elements = 0;
    let relations = 0;
    for (const { id, source } of corpus)
      for (const c4 of CONFIGS)
        for (const wrap of c4 === CONFIGS[0] ? [false, true] : [false]) {
          const { model, config } = parsedC4(source, { c4, wrap });
          const warnings: Warning[] = [];
          const layout = layoutC4(model, c4TestContext(config, theme, warnings));
          if (c4 === CONFIGS[0] && !wrap) {
            elements += layout.elements.length;
            relations += layout.relations.length;
          }
          const v = c4LayoutViolations(model, layout);
          if (v.length > 0)
            failures.push(`${id} ${JSON.stringify(c4)} wrap ${wrap}: ${v.slice(0, 3).join('; ')}`);
        }
    expect(corpus.length).toBeGreaterThan(2000);
    expect(elements).toBeGreaterThan(4000);
    expect(relations).toBeGreaterThan(1400);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
