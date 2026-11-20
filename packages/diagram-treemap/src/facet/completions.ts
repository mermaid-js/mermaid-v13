/**
 * Treemap completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * An item is offered only when the parser tests its kind at the cursor: `treemap` and
 * `treemap-beta` at the start; `classDef`, `title`, `accTitle:`, `accDescr` and `"` (a row) as
 * the first word of a line, after its indent if any; after a row's name, on its line, `:` (a
 * leaf's value follows), and right after the name `:::` and `:::name` for each class a
 * `classDef` defines; after `:::` those class names. Inside a name, a statement's text or a
 * `classDef` (probe modes `string`, `title`, `accTitle`, `accDescr`, `classDef`) and outside
 * code nothing is offered.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { treemapDocs } from '../generated/docs.ts';
import type { TreemapModel } from '../model.ts';
import type { TreemapDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { type ItemPlace, ITEMS, tokenBefore } from './tables.ts';
import { atLineStart, keywordCompletions, wordRange } from '@mermaid-js/shared/parser/facet';

/** The kind of the token that ends right at `at` (no blank between), if any. */
function gluedBefore(tokens: TokenStream | undefined, at: number): number | undefined {
  if (!tokens) return undefined;
  for (let j = tokenBefore(tokens, at); j >= 0; j--) {
    const end = tokens.end[j] ?? 0;
    if (end > at || (tokens.start[j] ?? 0) === end) continue;
    return end === at ? tokens.kind[j] : undefined;
  }
  return undefined;
}

export function treemapCompletions(
  probe: ProbeResult,
  doc: DocumentView<TreemapDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe, /[\s"':,]/);
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start);
  const before = gluedBefore(result.tokens, range.start);
  const placed: Record<ItemPlace, boolean> = {
    header: true,
    lineStart,
    afterName: !lineStart,
  };
  const classes = (result.model as TreemapModel).classes.map((c) => c.name);
  const out = keywordCompletions(
    ITEMS,
    expected,
    prefix,
    range,
    treemapDocs,
    // `:::` goes right after the name, with no blank (D401).
    (k) => placed[k.place] && (k.kind !== T.StyleSeparator || before === T.String)
  );
  // `:::`, the last row, is followed by `:::name` for each class.
  if (out.at(-1)?.label === ':::') {
    for (const name of classes) {
      out.push({ label: `:::${name}`, kind: 'class', insertText: `:::${name}`, range });
    }
  }
  // After `:::`: the class names the `classDef`s define.
  if (expected.has(T.Id) && before === T.StyleSeparator) {
    for (const name of classes) {
      if (name.startsWith(prefix))
        out.push({ label: name, kind: 'class', insertText: name, range });
    }
  }
  return out;
}
