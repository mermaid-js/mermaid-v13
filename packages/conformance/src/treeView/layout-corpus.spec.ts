import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutTreeView, parseTreeView } from '@mermaid-js/diagram-treeview';
import {
  treeViewLayoutViolations,
  treeViewTestContext,
  treeViewTestTheme,
} from '@mermaid-js/diagram-treeview/testing';
import type { CorpusItem } from '../types.ts';
import { treeViewGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #573): every source of the treeView
 * gate corpus (e2e fixtures, v12 spec strings, the hand-written and recovery cases, the line
 * separators, each also with CRLF and comment lines) parsed by the v13 parser, rejected sources
 * included (the model of what parsed), laid out under several `treeView` configs, gives no
 * `treeViewLayoutViolations`: no NaN; rows stacked in preorder without overlaps; each child
 * indented by `rowIndent + paddingX`; each stem ending at its last child's centre; descriptions
 * in one column clear of every label; everything inside the bounds.
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { showIcons: true },
  { rowIndent: 80, lineThickness: 3, paddingX: 12, paddingY: 0 },
  { rowIndent: 0, paddingX: 0, paddingY: 0, lineThickness: 0 },
  { paddingX: 0, lineThickness: 9, showIcons: true, defaultIconPack: 'fa' },
  {
    showIcons: true,
    filenameIcons: { 'package.json': 'logos:npm', Dockerfile: 'none' },
    extensionIcons: { '.ts': 'logos:typescript', js: 'logos:javascript' },
  },
  { rowIndent: '20', paddingX: -1, paddingY: 'x', lineThickness: null },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await treeViewTestTheme();
  corpus = await treeViewGateCorpus();
});

describe('treeView layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus under every config', () => {
    const failures: string[] = [];
    let rows = 0;
    let descriptions = 0;
    let highlights = 0;
    let icons = 0;
    for (const item of corpus) {
      const { model } = parseTreeView(item.source);
      for (const config of CONFIGS) {
        const layout = layoutTreeView(model, treeViewTestContext(theme, config));
        rows += layout.rows.length;
        for (const r of layout.rows) {
          if (r.description) descriptions++;
          if (r.highlight) highlights++;
          if (r.icon) icons++;
        }
        const v = treeViewLayoutViolations(model, layout, config);
        if (v.length > 0)
          failures.push(`${item.id} ${JSON.stringify(config)}: ${v.slice(0, 3).join('; ')}`);
      }
    }
    // The 15 12.2.0 fixtures, the 8 Cypress originals and the 56 parser and box inputs.
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(79);
    // Every part is exercised.
    expect(rows).toBeGreaterThan(25_000);
    expect(descriptions).toBeGreaterThan(1000);
    expect(highlights).toBeGreaterThan(200);
    expect(icons).toBeGreaterThan(10_000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
