import { pie } from '@mermaid-js/diagram-pie';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders pie charts before the
 * package is in the generated registry (#325): the plugin takes over the first-party `pie` row
 * (`replace: true`), so detection, config and every range are as they will be once it is
 * registered. Optionally in `theme`.
 */
export async function pieApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([pie], { lazyLoad: false, replace: true });
  return m;
}
