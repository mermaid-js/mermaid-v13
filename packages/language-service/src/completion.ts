/**
 * Completion (DESIGN §4.5, D95, D96). Front matter answers first: an offset inside it gets
 * front-matter keys and values from the config schema, and nothing else. The diagram text
 * is the facet's (#32: re-parse with `probe: offset` and ask `facet.completions`).
 */
import type { CompletionItem } from '@mermaid-js/core/parser-kit';
import { frontMatterCompletions } from './config/completion.ts';
import type { FrontMatterTree } from './config/front-matter.ts';
import type { DocumentContext } from './context.ts';

/** Whether the front matter (fences included; an unclosed one to the end) owns `offset`. */
export function inFrontMatter(fm: FrontMatterTree, offset: number): boolean {
  return fm.range.start <= offset && (offset < fm.range.end || fm.unclosed);
}

export function completions(
  ctx: DocumentContext,
  fm: FrontMatterTree | undefined,
  offset: number
): CompletionItem[] {
  if (fm !== undefined && inFrontMatter(fm, offset)) return frontMatterCompletions(ctx, fm, offset);
  // #32: the facet's completions on the diagram text go here.
  return [];
}
