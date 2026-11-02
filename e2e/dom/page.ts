/** The page script: exposes the public `mermaid` API as `window.mermaid` for the specs. */
// The workspace packages from source (the repo root does not depend on `mermaid`).
import mermaid from '../../packages/mermaid/src/index.ts';
import interactions from '../../packages/plugin-interactions/src/index.ts';

declare global {
  interface Window {
    mermaid: typeof mermaid;
    /** `@mermaid-js/plugin-interactions`, for the interactions specs (#23). Not registered. */
    mermaidInteractions: typeof interactions;
  }
}
window.mermaid = mermaid;
window.mermaidInteractions = interactions;
