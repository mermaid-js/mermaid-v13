import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders sequence diagrams through
 * the generated registry (#145), optionally in `theme`.
 */
export function sequenceApi(theme?: MermaidConfig['theme']): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...(theme !== undefined ? { theme } : {}) });
  return m;
}
