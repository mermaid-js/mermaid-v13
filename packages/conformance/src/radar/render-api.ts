import { radar } from '@mermaid-js/diagram-radar';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders radar charts before the
 * package is in the generated registry (#449): the plugin takes over the first-party `radar`
 * row (`replace: true`), so detection, config and every range are as they will be once it is
 * registered. Optionally in `theme` or any other config. #449 drops the registration.
 */
export async function radarApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([radar], { lazyLoad: false, replace: true });
  return m;
}
