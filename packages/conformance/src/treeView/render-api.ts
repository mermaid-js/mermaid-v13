import { treeView } from '@mermaid-js/diagram-treeview';
import { createMermaid, type ExtensionPlugin, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders treeView diagrams before the
 * package is in the generated registry (T5, #577): the plugin takes over the first-party
 * `treeView` row (`replace: true`), so detection, config and every range are as they will be
 * once it is registered. Optionally in `theme` or any other config, and with `extensions` (an
 * icons extension's glyphs). T5 drops the registration, as treemap's #514 did.
 */
export async function treeViewApi(
  config: MermaidConfig = {},
  extensions: readonly ExtensionPlugin[] = []
): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([treeView], { lazyLoad: false, replace: true });
  if (extensions.length > 0) await m.registerExternalDiagrams([...extensions]);
  return m;
}
