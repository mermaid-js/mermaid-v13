/**
 * Treemap (#514), which v12 never sketched: its section's `look: handDrawn` warns without the
 * plugin and draws unsketched with it. Its whole corpus runs in `unsketched.spec.ts`.
 */
import { createMermaid, type Mermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

async function outcome(m: Mermaid, text: string) {
  const r = await m.render('u', text);
  return { svg: r.svg, codes: r.warnings.map((w) => w.code) };
}

const plain = createMermaid();
plain.initialize({ deterministic: true });
const withPlugin = createMermaid();
await withPlugin.registerExternalDiagrams([handDrawn]);
withPlugin.initialize({ deterministic: true, handDrawn: true } as never);

describe('treemap with the hand-drawn plugin (#514)', () => {
  it('treemap.look: handDrawn warns without the plugin, and draws unsketched with it', async () => {
    const text = '---\nconfig:\n  treemap:\n    look: handDrawn\n---\ntreemap\n  "A"\n    "b": 1\n';
    const plainSvg = (await plain.render('u', 'treemap\n  "A"\n    "b": 1\n')).svg;
    const before = await outcome(plain, text);
    const after = await outcome(withPlugin, text);
    expect(before).toEqual({ svg: plainSvg, codes: ['LOOK_REMOVED'] });
    expect(after).toEqual({ svg: plainSvg, codes: [] });
  });
});
