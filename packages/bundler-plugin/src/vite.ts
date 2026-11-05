/** `mermaid()` for vite: `plugins: [mermaid()]` (see `index.ts`). */
import { unplugin } from './index.ts';

export type { MermaidPluginOptions } from './index.ts';

export const mermaid = unplugin.vite;
export default mermaid;
