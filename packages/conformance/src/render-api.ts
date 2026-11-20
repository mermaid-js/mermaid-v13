import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders through the generated
 * registry, as an integrator's does. Optionally in `theme` or any other config.
 */
export function deterministicApi(config: InitializeConfig = {}): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}
