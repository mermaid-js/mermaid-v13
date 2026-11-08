import { treemap } from '@mermaid-js/diagram-treemap';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders treemap diagrams before the package
 * is in the generated registry (T5, #514): the plugin takes over the first-party `treemap` row
 * (`replace: true`), so detection, config and every range are as they will be once it is
 * registered. Optionally in `theme` or any other config. T5 drops the registration, as radar's
 * #449 did.
 */
export async function treemapApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([treemap], { lazyLoad: false, replace: true });
  return m;
}
