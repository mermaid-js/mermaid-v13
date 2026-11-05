import { quadrant } from '@mermaid-js/diagram-quadrant';
import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';

/**
 * A `mermaid` API that renders quadrant charts before the plugin is in the generated registry
 * (#317 adds the manifest). The first-party `quadrantChart` row has no loader yet, so the plugin
 * takes that type over with `replace: true`, detected in its first-party slot.
 */
export async function quadrantApi(config: InitializeConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([quadrant], { replace: true });
  return m;
}
