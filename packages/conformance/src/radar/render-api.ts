import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders radar charts through the
 * generated registry row (#449). Optionally in `theme` or any other config.
 */
export function radarApi(config: MermaidConfig = {}): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}
