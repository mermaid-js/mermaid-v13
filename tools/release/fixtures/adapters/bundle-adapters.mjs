// A page that uses both editor adapters, bundled with code splitting (#174, D134).
import { mermaid } from '@mermaid-js/language-service-codemirror';
import { registerMermaid } from '@mermaid-js/language-service-monaco';

export { mermaid, registerMermaid };
