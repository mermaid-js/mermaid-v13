import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders event models through the
 * generated registry row (#611). Optionally in `theme` or any other config.
 */
export function eventModelingApi(config: MermaidConfig = {}): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}
