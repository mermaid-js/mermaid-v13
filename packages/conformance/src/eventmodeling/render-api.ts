import { eventmodeling } from '@mermaid-js/diagram-eventmodeling';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders event models before the
 * package is in the generated registry (T5, #611): the plugin takes over the first-party
 * `eventmodeling` row (`replace: true`), so detection, config and every range are as they will be
 * once it is registered. Optionally in `theme` or any other config. T5 drops the registration, as
 * treemap's #514 did.
 */
export async function eventModelingApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([eventmodeling], { lazyLoad: false, replace: true });
  return m;
}
