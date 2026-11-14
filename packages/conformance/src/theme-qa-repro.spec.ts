/**
 * #802 (spec #795 T6): the QA theme reports, rendered through the public `render()` and held to
 * v12 12.2.0's resolved theme values (D151: v12 is the oracle).
 *
 * #407: `base` with a dark `primaryColor`, a white `titleColor` and `darkMode`, set by
 * directive. Before #797 (T1) `base` held `tertiaryColor` as the literal `#f6f9ff`, so the
 * subgraphs were near white and their white titles unreadable; v12 derives `tertiaryColor`
 * (and so `clusterBkg`) from `primaryColor`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, formatColor, parseColor } from '@mermaid-js/core/theme';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './corpus.ts';
import { loadOracle } from './oracle.ts';
import { parseSvg } from './svg-tree.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

function hex(v: unknown): string {
  const rgba = typeof v === 'string' ? parseColor(v) : undefined;
  return rgba ? formatColor(rgba) : String(v);
}

function v12Vars(theme: string, themeVariables: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme, themeVariables });
  const vars = v12.mermaidAPI.getConfig().themeVariables;
  v12.mermaidAPI.reset();
  return vars;
}

describe('#407: subgraph titles under base with a dark primaryColor (fixed by #797)', () => {
  const source = readFileSync(
    join(
      REPO_ROOT,
      'e2e/diagrams/flowchart/visual-check/63-title-on-subgraphs-should-be-themeable.mmd'
    ),
    'utf8'
  );
  // The fixture's directive, as v12 reads it.
  const themeVariables = { primaryColor: '#411d4e', titleColor: 'white', darkMode: true };

  it('fills the subgraphs with v12 clusterBkg and writes the titles in titleColor', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true, output: { cssVariables: false } } as InitializeConfig);
    const tree = parseSvg((await m.render('qa407', source)).svg);
    const old = v12Vars('base', themeVariables);
    // v12's derived green; v13 drew `#f6f9ff` before #797.
    expect(hex(old.clusterBkg)).toBe('#346124');
    const clusters = tree.find({ class: 'cluster' });
    expect(clusters).toHaveLength(2);
    for (const cluster of clusters) {
      const rect = tree.children(cluster).find((c) => tree.tag(c) === 'rect');
      const title = tree
        .children(cluster)
        .find((c) => tree.getAttr(c, 'class') === 'cluster-label');
      const fill = hex(tree.getAttr(rect!, 'fill'));
      const ink = hex(tree.getAttr(title!, 'fill'));
      expect(fill).toBe(hex(old.clusterBkg));
      expect(ink).toBe(hex(old.titleColor));
      expect(contrastRatio(parseColor(ink)!, parseColor(fill)!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
