import { wardley } from '@mermaid-js/diagram-wardley';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders Wardley maps before the
 * package is in the generated registry (#497): the plugin takes over the first-party `wardley`
 * row (`replace: true`), so detection and every range are as they will be once it is
 * registered. Optionally in `theme` or any other config. #497 drops the registration.
 */
export async function wardleyApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([wardley], { lazyLoad: false, replace: true });
  return m;
}
