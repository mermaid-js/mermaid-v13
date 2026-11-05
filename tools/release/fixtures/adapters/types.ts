// The adapters' published types, as a TypeScript user imports them (#174).
import type { Extension } from '@codemirror/state';
import { LEZER_HIGHLIGHTERS, mermaid } from '@mermaid-js/language-service-codemirror';
import type { MermaidOptions } from '@mermaid-js/language-service-codemirror';
import { MONARCH_HIGHLIGHTERS, registerMermaid } from '@mermaid-js/language-service-monaco';
import type { MonarchDefinition } from '@mermaid-js/language-service-monaco';
import type { FirstPartyFacetId } from '@mermaid-js/language-service';

const options: MermaidOptions = { delay: 100 };
export const extension: Promise<Extension> = mermaid(options);
// Both maps have a row per facet id.
const id: FirstPartyFacetId = 'flowchart';
export const lezer: Promise<unknown> = LEZER_HIGHLIGHTERS[id]();
export const flowchart: Promise<MonarchDefinition> = MONARCH_HIGHLIGHTERS[id].load();
export const register: typeof registerMermaid = registerMermaid;
