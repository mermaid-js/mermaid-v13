/**
 * Hover (DESIGN §4.5, D93, D96). Front matter answers first: an offset inside it gets the
 * config key's schema docs. The diagram text is the facet's (#32 adds `facet.hover` there).
 */
import type { Hover } from '@mermaid-js/core/parser-kit';
import { frontMatterHover } from './config/hover.ts';
import type { FrontMatterTree } from './config/front-matter.ts';
import type { DocumentContext } from './context.ts';
import { inFrontMatter } from './completion.ts';

export function hover(
  ctx: DocumentContext,
  fm: FrontMatterTree | undefined,
  offset: number
): Hover | undefined {
  if (fm !== undefined && inFrontMatter(fm, offset)) return frontMatterHover(ctx, fm, offset);
  // #32: the facet's hover on the diagram text goes here.
  return undefined;
}
