import { cynefin } from '@mermaid-js/diagram-cynefin';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders cynefin diagrams before the
 * package has its manifest (#469): the plugin takes over the first-party `cynefin` detector row
 * (`replace: true`), so detection, config and every range are as they will be once it is
 * registered. `mermaid/slim`'s `createMermaid({ diagrams })` refuses it until then, since the
 * row has no plugin id yet. Optionally in `theme` or any other config.
 */
export async function cynefinApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([cynefin], { lazyLoad: false, replace: true });
  return m;
}
