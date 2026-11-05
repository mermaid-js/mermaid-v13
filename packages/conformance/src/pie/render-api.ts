import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders pie charts through the
 * generated registry row (#325). Optionally in `theme` or any other config.
 */
export function pieApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return Promise.resolve(m);
}
