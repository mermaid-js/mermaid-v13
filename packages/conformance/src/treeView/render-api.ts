import { createMermaid, type ExtensionPlugin, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders treeView diagrams, SVG and
 * text, through the generated registry row (#577). Optionally in `theme` or any other config,
 * and with `extensions` (an icons extension's glyphs).
 */
export async function treeViewApi(
  config: MermaidConfig = {},
  extensions: readonly ExtensionPlugin[] = []
): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  if (extensions.length > 0) await m.registerExternalDiagrams([...extensions]);
  return m;
}
