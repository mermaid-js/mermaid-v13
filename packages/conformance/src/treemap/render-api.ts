import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders treemap diagrams through the
 * generated registry row (#514). Optionally in `theme` or any other config.
 */
export function treemapApi(config: MermaidConfig = {}): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}
