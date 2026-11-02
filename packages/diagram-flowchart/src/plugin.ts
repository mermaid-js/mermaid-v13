import { detectFlowchart, parseFlowchart } from './parser/index.ts';
import type { FlowParseOptions, FlowParseResult } from './parser/index.ts';

/**
 * The flowchart diagram plugin: what the pipeline (#15) and the renderer (#14) build on.
 * `parse` takes the whole source (front matter included); every range is into it.
 */
export const flowchart = {
  id: 'flowchart',
  aliases: ['graph', 'flowchart-v2', 'flowchart-elk'] as readonly string[],
  detector: (text: string): boolean => detectFlowchart(text) !== undefined,
  parse: (text: string, options?: FlowParseOptions): FlowParseResult =>
    parseFlowchart(text, options),
};
