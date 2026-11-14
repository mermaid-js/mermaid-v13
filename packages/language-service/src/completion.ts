/**
 * Completion (DESIGN §4.5, D95, D96). Front matter answers first: an offset inside it gets
 * front-matter keys and values from the config schema, and nothing else. The diagram text is
 * the facet's: the text is parsed again with `probe: offset` and the facet maps the probe to
 * items. A text whose type is not detected (empty, or a header being typed) gets every loaded
 * facet's answer on its first line: the diagram keywords.
 */
import type { CompletionItem, LanguageFacet } from '@mermaid-js/core/parser-kit';
import { frontMatterCompletions } from './config/completion.ts';
import type { FrontMatterTree } from './config/front-matter.ts';
import type { DocumentContext } from './context.ts';

/** Whether the front matter (fences included; an unclosed one to the end) owns `offset`. */
export function inFrontMatter(fm: FrontMatterTree, offset: number): boolean {
  return fm.range.start <= offset && (offset < fm.range.end || fm.unclosed);
}

/**
 * `facet`'s items for `text` at `offset`; none when its probe parse or `completions` throws (a
 * third-party facet): no query throws (R-LANG-4).
 */
function facetItems(facet: LanguageFacet, text: string, offset: number): CompletionItem[] {
  try {
    const result = facet.parse(text, { keepTokens: true, probe: offset });
    return result.probe ? facet.completions(result.probe, { text, result }) : [];
  } catch {
    return [];
  }
}

/** The header keywords of every loaded facet, on the first line of an undetected text. */
function headerItems(ctx: DocumentContext, offset: number): CompletionItem[] {
  const { text, start } = ctx;
  const nl = text.slice(start).search(/[\r\n]/);
  const lineEnd = nl < 0 ? text.length : start + nl;
  if (offset < start || offset > lineEnd) return [];
  const head = text.slice(0, lineEnd);
  const out: CompletionItem[] = [];
  for (const facet of ctx.available) {
    for (const item of facetItems(facet, head, offset)) {
      if (item.kind === 'keyword' && !out.some((x) => x.label === item.label)) out.push(item);
    }
  }
  return out;
}

export function completions(
  ctx: DocumentContext,
  fm: FrontMatterTree | undefined,
  offset: number
): CompletionItem[] {
  if (fm !== undefined && inFrontMatter(fm, offset)) return frontMatterCompletions(ctx, fm, offset);
  if (ctx.entry === undefined) return headerItems(ctx, offset);
  if (!ctx.facet) return [];
  return facetItems(ctx.facet, ctx.text, offset);
}

/**
 * Characters after which an editor asks for completions without a typed word: front-matter
 * `:`, arrows (`-`, `=`, `.`), `&`, `@`, `{` (shape data) and `,`. Every adapter uses this one
 * list (LSP `triggerCharacters`, Monaco's, CodeMirror's activation while typing).
 */
export const COMPLETION_TRIGGERS: readonly string[] = Object.freeze([
  ':',
  '-',
  '=',
  '.',
  '&',
  '@',
  '{',
  ',',
]);
