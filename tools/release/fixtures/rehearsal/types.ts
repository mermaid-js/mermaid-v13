// Type-checks the published .d.ts files from a consumer, both entries.
import mermaid, { MermaidError, type RenderResult, type TextRenderResult } from 'mermaid';
import { createMermaid, type SlimOptions } from 'mermaid/slim';
import { flowchart } from '@mermaid-js/diagram-flowchart';

export const full: Promise<RenderResult> = mermaid.render('a', 'flowchart LR\n  A --> B');
export const text: Promise<TextRenderResult> = mermaid.render('b', 'flowchart LR\n  A --> B', {
  format: 'ascii',
});
const options: SlimOptions = { diagrams: [flowchart] };
export const slim = createMermaid(options).render('c', 'flowchart LR\n  A --> B');
export const isError = (e: unknown): boolean => e instanceof MermaidError && e.code === 'SYNTAX';
