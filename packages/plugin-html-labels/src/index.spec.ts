import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from 'mermaid';
import { htmlLabels, mountHtmlLabels } from './index.ts';

const FLOW = 'flowchart LR\n  A["Alpha <b>one</b>"] -->|goes| B("`**Beta**`")';
const CLASS = 'classDiagram\n  class Box~T~ {\n    +List~T~ items\n  }';

describe('@mermaid-js/plugin-html-labels in Node', () => {
  it('draws what mermaid draws without it: there is no DOM to measure in', async () => {
    for (const text of [FLOW, CLASS]) {
      const plain = await createMermaid().render('x', text);
      const m = createMermaid();
      await m.registerExternalDiagrams([htmlLabels]);
      const r = await m.render('x', text);
      expect(r.svg).toBe(plain.svg);
      assertInert(r.svg);
    }
  });

  it("owns html.labels, on by default, and takes v12's keys without a warning", async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([htmlLabels]);
    const configs: Record<string, unknown>[] = [
      {},
      { htmlLabels: true },
      { flowchart: { htmlLabels: false } },
    ];
    for (const config of configs) {
      m.initialize(config);
      expect((await m.render('x', FLOW)).warnings).toEqual([]);
    }
  });

  it("is pointed to by the warning for v12's keys while it is not registered", async () => {
    const m = createMermaid();
    const v12: Record<string, unknown> = { htmlLabels: true };
    m.initialize(v12);
    const { warnings } = await m.render('x', FLOW);
    expect(warnings.map((w) => w.code)).toEqual(['CONFIG_REMOVED_KEY']);
    expect(warnings[0]!.message).toContain('the HTML labels plugin');
  });

  it('mountHtmlLabels does nothing for an element without a window', () => {
    const element = { ownerDocument: { defaultView: null } } as unknown as Element;
    expect(mountHtmlLabels(element)).toBe(0);
  });
});
