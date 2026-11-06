import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders cynefin diagrams through
 * the generated registry row (#469). Optionally in `theme` or any other config.
 */
export function cynefinApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return Promise.resolve(m);
}
