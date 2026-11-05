/** `mermaid()` for esbuild: `plugins: [mermaid()]` (see `index.ts`). */
import { unplugin } from './index.ts';

export type { MermaidPluginOptions } from './index.ts';

export const mermaid = unplugin.esbuild;
export default mermaid;
