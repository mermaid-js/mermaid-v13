/** The page script: exposes the public `mermaid` API as `window.mermaid` for the specs. */
// The workspace package from source (the repo root does not depend on `mermaid`).
import mermaid from '../../packages/mermaid/src/index.ts';

declare global {
  interface Window {
    mermaid: typeof mermaid;
  }
}
window.mermaid = mermaid;
