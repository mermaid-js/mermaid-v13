// Optional packages (ELK, math, and M4's icons and hand-drawn look) depend on core, never the
// reverse: core and the packages mermaid ships import none of them (R-PLUG-8, D153).
import { math } from '@mermaid-js/plugin-math';

export const elk = () => import('@mermaid-js/layout-elk');
export const icons = () => import('@mermaid-js/plugin-icons');
export { math };
