// Only the public mermaid package sits on top; nothing below may import it.
export const load = () => import('mermaid');
