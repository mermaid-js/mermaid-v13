import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders XY charts through the
 * generated registry row (#513). Optionally in `theme` or any other config.
 */
export function xyChartApi(config: MermaidConfig = {}): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}
