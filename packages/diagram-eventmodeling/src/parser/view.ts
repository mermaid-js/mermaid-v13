/**
 * The text v12's event modeling lexer read (#600): core's preprocess and source view, with the
 * `%%` comment lines kept.
 */
import { sourceView } from '@mermaid-js/core/parser-kit';
import type { Hole, Range, SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface EventModelingView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's event modeling lexer read it: core's preprocess (front matter, directives) and
 * the source view over the body with default options (v12 ran every shared rewrite), except
 * that the `%%` comment lines stay. v12's event modeling db set `preserveCommentsWhenParsing`, so
 * its parser read `withComments` (directives removed, comment lines kept, nothing trimmed), and
 * its lexer took them as hidden EM_SINGLE_LINE_COMMENT tokens.
 *
 * Core's view has no option to keep them (no core change in spec #527), so this takes the view
 * of a copy of `src` in which every `%` of each comment span is replaced (a same-length edit,
 * which no other rewrite reads: tag quotes and dropped semicolons come out as v12's), and reads
 * its text back from `src` through its runs. Every `%`, not the first: a span holds the rest of
 * its line, and after a U+2028 or U+2029 in it (a line start to core) a `%%` would open a new
 * span. Rounds repeat until the view has no comment span; each removes at least one `%`.
 */
export function eventModelingView(
  src: string,
  pre: PreprocessResult = preprocess(src)
): EventModelingView {
  const directives = pre.directives.map((d) => d.range).sort((a, b) => a.start - b.start);
  let copy = src;
  let view = sourceView(copy, pre.bodyStart, directives);
  while (view.holes.some((h) => h.kind === 'comment')) {
    const next = uncomment(copy, view.holes, directives);
    if (next === copy) break;
    copy = next;
    view = sourceView(copy, pre.bodyStart, directives);
  }
  if (copy === src) return { bodyStart: pre.bodyStart, view };
  return { bodyStart: pre.bodyStart, view: { ...view, text: textOf(src, view) } };
}

/**
 * `copy` with every `%` of its comment spans replaced, outside the directives (a comment span
 * may start inside a directive v12 removed first: its `^\s*` then matched the line break the
 * directive left).
 */
function uncomment(copy: string, holes: readonly Hole[], directives: readonly Range[]): string {
  const parts: string[] = [];
  let at = 0;
  let d = 0;
  for (const h of holes) {
    if (h.kind !== 'comment') continue;
    for (let k = copy.indexOf('%', Math.max(h.start, at)); k !== -1 && k < h.end; ) {
      while (d < directives.length && (directives[d]?.end ?? 0) <= k) d++;
      const cut = directives[d];
      if (cut && cut.start <= k) {
        k = copy.indexOf('%', cut.end);
        continue;
      }
      parts.push(copy.slice(at, k), '_');
      at = k + 1;
      k = copy.indexOf('%', at);
    }
  }
  return at === 0 ? copy : parts.join('') + copy.slice(at);
}

/** `src` without the view's removed spans: its runs read from `src`. */
function textOf(src: string, view: SourceView): string {
  const { runs } = view;
  if (!runs) return src;
  const parts: string[] = [];
  for (let k = 0; k < runs.length; k += 2) {
    const from = runs[k + 1] ?? 0;
    const length = (runs[k + 2] ?? view.text.length) - (runs[k] ?? 0);
    parts.push(src.slice(from, from + length));
  }
  return parts.join('');
}
