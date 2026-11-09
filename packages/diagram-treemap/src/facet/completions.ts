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
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { treemapDocs } from '../generated/docs.ts';
import type { TreemapModel } from '../model.ts';
import type { TreemapDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { ITEMS, span, tokenBefore } from './tables.ts';
import type { ItemPlace } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0))
    end = tokens.end[i] ?? o;
  // A word stops at the first blank, line break, quote, `:` or `,` after the cursor.
  const stop = /[\s"':,]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return span(probe.prefix.start, end);
}

/** Whether only blanks come before `at` on its line. */
function atLineStart(text: string, at: number): boolean {
  let i = at;
  while (i > 0 && (text.charAt(i - 1) === ' ' || text.charAt(i - 1) === '\t')) i--;
  return i === 0 || text.charAt(i - 1) === '\n' || text.charAt(i - 1) === '\r';
}

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
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start);
  const before = gluedBefore(result.tokens, range.start);
  const placed: Record<ItemPlace, boolean> = {
    header: true,
    lineStart,
    afterName: !lineStart,
  };
  const out: CompletionItem[] = [];
  const classes = (result.model as TreemapModel).classes.map((c) => c.name);
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || !placed[k.place]) continue;
    // `:::` goes right after the name, with no blank (D401).
    if (k.kind === T.StyleSeparator && before !== T.String) continue;
    if (!k.label.startsWith(prefix)) continue;
    const documentation = treemapDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
    if (k.kind !== T.StyleSeparator) continue;
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
