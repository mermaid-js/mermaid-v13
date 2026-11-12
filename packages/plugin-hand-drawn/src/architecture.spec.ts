/**
 * Architecture (#618), which v12 never sketched (D301): its section's `look: handDrawn` warns
 * without the plugin and draws unsketched with it. Its whole corpus runs in `unsketched.spec.ts`.
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

const BODY =
  'architecture-beta\n  group g(cloud)[G]\n  service a(server)[A] in g\n  service b in g\n  a:R --> L:b\n';

describe('architecture with the hand-drawn plugin (#618)', () => {
  it('architecture.look: handDrawn warns without the plugin, and draws unsketched with it', async () => {
    const text = '---\nconfig:\n  architecture:\n    look: handDrawn\n---\n' + BODY;
    const plainSvg = (await plain.render('u', BODY)).svg;
    expect(await outcome(plain, text)).toEqual({ svg: plainSvg, codes: ['LOOK_REMOVED'] });
    expect(await outcome(withPlugin, text)).toEqual({ svg: plainSvg, codes: [] });
  });
});
