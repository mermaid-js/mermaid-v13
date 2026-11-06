/**
 * Cynefin completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * An item is offered only when the parser tests its kind at the cursor: `cynefin-beta` at the
 * start; the five domains, `title`, `accTitle:` and `accDescr` at the start of a line; `-->`
 * after a domain name; the domains after `-->`, but not the source (a self-loop is not drawn,
 * D365); `:` after a transition's target; `"` inside a
 * block and after `:`. Inside an item, a label or a statement's text (probe modes `string`,
 * `title`, `accTitle`, `accDescr`) and outside code nothing is offered.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { cynefinDocs } from '../generated/docs.ts';
import type { CynefinDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { ITEMS, LINE_START, span, tokenBefore } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0))
    end = tokens.end[i] ?? o;
  // A word stops at the first blank, line break, quote or `:` after the cursor.
  const stop = /[\s"':]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return span(probe.prefix.start, end);
}

/** The text of `at`'s line before it. */
function lineBefore(text: string, at: number): string {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  return text.slice(lineStart, at);
}

export function cynefinCompletions(
  probe: ProbeResult,
  doc: DocumentView<CynefinDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const before = lineBefore(text, range.start);
  const lineStart = /^[\t ]*$/.test(before);
  // After `-->`: the source domain, which completion leaves out.
  const source = /([a-z]+)[\t ]*-->[\t ]*$/.exec(before)?.[1];
  const afterArrow = source !== undefined;
  const out: CompletionItem[] = [];
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || !k.label.startsWith(prefix)) continue;
    if (k.kind === T.DomainName && k.label === source) continue;
    if (LINE_START.has(k.kind) && !lineStart && !(k.kind === T.DomainName && afterArrow)) continue;
    const documentation = cynefinDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}
