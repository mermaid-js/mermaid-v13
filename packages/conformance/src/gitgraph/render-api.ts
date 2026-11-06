import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders git graphs through the
 * generated registry (#374), as an integrator's does. Optionally in `theme` or any other config.
 */
export function gitApi(config: MermaidConfig = {}): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}
