// The adapters' published types, as a TypeScript user imports them (#174).
import type { Extension } from '@codemirror/state';
import { LEZER_HIGHLIGHTERS, mermaid } from '@mermaid-js/language-service-codemirror';
import type { MermaidOptions } from '@mermaid-js/language-service-codemirror';
import { MONARCH_HIGHLIGHTERS, registerMermaid } from '@mermaid-js/language-service-monaco';
import type { MonarchDefinition } from '@mermaid-js/language-service-monaco';

const options: MermaidOptions = { delay: 100 };
export const extension: Promise<Extension> = mermaid(options);
export const lezerIds: string[] = Object.keys(LEZER_HIGHLIGHTERS);
export const flowchart: Promise<MonarchDefinition> | undefined =
  MONARCH_HIGHLIGHTERS.flowchart?.load();
export const register: typeof registerMermaid = registerMermaid;
