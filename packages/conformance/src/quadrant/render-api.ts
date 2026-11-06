import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`, then `config`) that renders quadrant
 * charts through the generated registry (#317), as a user's `mermaid` does.
 */
export function quadrantApi(config: InitializeConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return Promise.resolve(m);
}
