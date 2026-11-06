import { packet } from '@mermaid-js/diagram-packet';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders packet diagrams before the
 * package is in the generated registry (#462): the plugin takes over the first-party `packet`
 * row (`replace: true`), so detection, config and every range are as they will be once it is
 * registered. Optionally in `theme` or any other config. #462 drops the registration.
 */
export async function packetApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([packet], { lazyLoad: false, replace: true });
  return m;
}
