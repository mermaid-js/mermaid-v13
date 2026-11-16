// Text from a diagram reaches the SVG escaped on both writer backings (R-SEC-2): a label, an
// edge label, a link and its tooltip, each holding the characters escaping rewrites.
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, type ExtensionPlugin } from './index.ts';

const TEXT = [
  'flowchart LR',
  '  A["x < y & z > w #quot;q#quot; 😀"] --> B',
  '  click A "https://e.com/?a=1&b=2" "tip & <t> q"',
  '  B -- "edge & <e>" --> C',
].join('\n');

/** An extension whose `postRender` changes nothing: the render then writes into the tree. */
const treeOnly: ExtensionPlugin = { id: 'tree-only', postRender() {} };

async function svgOf(tree: boolean): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true, discovery: false, securityLevel: 'loose' });
  if (tree) await m.registerExternalDiagrams([treeOnly]);
  return (await m.render('esc', TEXT)).svg;
}

describe('diagram text in the SVG (R-SEC-2)', () => {
  it('is escaped in text and in attribute values, and both backings write the same', async () => {
    const stream = await svgOf(false);
    expect(stream).toContain('>x &lt; y &amp; z &gt; w &quot;q&quot; 😀<');
    expect(stream).toContain('>edge &amp; &lt;e&gt;<');
    expect(stream).toContain('<title>tip &amp; &lt;t&gt; q</title>');
    expect(stream).toContain(' href="https://e.com/?a=1&amp;b=2"');
    expect(stream).not.toMatch(/[<>"]x < y|&b=2"|<t>/);
    expect(() => assertInert(stream)).not.toThrow();
    expect(await svgOf(true)).toBe(stream);
  });
});
