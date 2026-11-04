/** The page script: exposes the public `mermaid` API as `window.mermaid` for the specs. */
// The workspace packages from source (the repo root does not depend on `mermaid`).
import mermaid from '../../packages/mermaid/src/index.ts';
import interactions from '../../packages/plugin-interactions/src/index.ts';
import {
  menuDiagram,
  menuText,
} from '../../packages/plugin-interactions/src/testing/menu-diagram.ts';

declare global {
  interface Window {
    mermaid: typeof mermaid;
    /** `@mermaid-js/plugin-interactions`, for the interactions specs (#23). Not registered. */
    mermaidInteractions: typeof interactions;
    /** The interactions specs' menu test diagram (#147), registered as `sequence`. */
    menuDiagram: typeof menuDiagram;
    menuText: typeof menuText;
  }
}
window.mermaid = mermaid;
window.mermaidInteractions = interactions;
window.menuDiagram = menuDiagram;
window.menuText = menuText;
