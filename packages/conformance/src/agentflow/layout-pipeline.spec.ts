// The agentflow layout through `createMermaid().render()` (spec #523 T3) before the plugin and
// its manifest land (#550): a test-only plugin with the package's parser and `layoutAgentflow`,
// registered over the `agentflow` row, and a renderer that draws nothing. It shows the layout
// takes any graph engine by name (ELK, D171; `compass`, D327) and that `mermaid` warns
// `ELK_ALGORITHM_IGNORED` for a flow's `@{ algorithm }` under ELK (D174).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLayout } from '@mermaid-js/core/layout';
import type { SvgWriter } from '@mermaid-js/core/svg';
import {
  agentflow,
  layoutAgentflow,
  type AgentflowLayout,
  type AgentflowLayoutContext,
  type AgentflowModel,
} from '@mermaid-js/diagram-agentflow';
import { agentflowLayoutProblems } from '@mermaid-js/diagram-agentflow/testing';
import elkLayouts from '@mermaid-js/layout-elk';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/agentflow/baseline/layout/${name}.mmd`), 'utf8');

/** `text` (front matter without `config`) with `layout: <name>` in its front matter. */
const withLayout = (text: string, name: string): string =>
  text.replace(/^---\n/, `---\nconfig:\n  layout: ${name}\n`);

function api() {
  const laid: { model: AgentflowModel; layout: AgentflowLayout }[] = [];
  const plugin = {
    id: 'agentflow',
    formats: ['svg'] as const,
    layoutKind: 'graph' as const,
    detector: (text: string) => /^\s*agentflow-beta\b/.test(text),
    // The plugin's own parse (config keys, limits, claims), not a copy of it.
    parse: agentflow.parse,
    layout: (model: AgentflowModel, ctx: AgentflowLayoutContext): AgentflowLayout => {
      const layout = layoutAgentflow(model, ctx);
      laid.push({ model, layout });
      return layout;
    },
    render: (_m: AgentflowModel, layout: AgentflowLayout, _c: unknown, w: SvgWriter) => {
      w.open('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: [0, 0, Math.ceil(layout.width), Math.ceil(layout.height)],
      });
      w.close();
    },
  };
  const m = createMermaid();
  m.initialize({ deterministic: true });
  m.registerLayoutLoaders(elkLayouts);
  return {
    m,
    laid,
    ready: m.registerExternalDiagrams([plugin], { lazyLoad: false, replace: true }),
  };
}

describe('agentflow layout through the pipeline', () => {
  it.each(['layered', 'elk', 'elk.layered', 'compass'])(
    'lays out with `layout: %s`, valid and unwarned',
    async (name) => {
      const { m, laid, ready } = api();
      await ready;
      const r = await m.render('a', withLayout(fixture('every-shape-many-ends-tb'), name));
      expect(r.warnings).toEqual([]);
      expect(laid).toHaveLength(1);
      const { model, layout } = laid[0]!;
      expect(validateLayout(layout.agentflow.graph, layout)).toEqual([]);
      expect(agentflowLayoutProblems(model, layout)).toEqual([]);
    },
    60_000
  );

  it('warns ELK_ALGORITHM_IGNORED once for a flow `algorithm` under ELK (D174), not under layered', async () => {
    const { m, ready } = api();
    await ready;
    const text = fixture('flow-directions-and-algorithm');
    const elk = await m.render('a', withLayout(text, 'elk'));
    expect(elk.warnings.map((w) => w.code)).toEqual(['ELK_ALGORITHM_IGNORED']);
    expect(elk.warnings[0]!.message).toContain('elk.rectpacking');
    expect((await m.render('a', text)).warnings).toEqual([]);
  }, 60_000);
});
