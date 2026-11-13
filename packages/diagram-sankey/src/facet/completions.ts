/**
 * Sankey completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * `sankey` where the header goes; at the start of a source or target field (bare, or inside
 * its quotes) the node names already used, each written as that field needs it (quoted when it
 * holds a `,`, `"` or line break; `"` doubled inside quotes). Not in a value, not the row's own
 * source as its target (a self-link is an error, D393), not a name whose only occurrence is the
 * field being typed. Nothing outside code (comments, directives, front matter).
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { sankeyDocs } from '../generated/docs.ts';
import type { SankeyDocument } from '../parser/ast.ts';
import { SankeyKind as T } from '../parser/tokens.ts';
import { fieldText, isFieldBlank, withFieldBlanks } from './names.ts';
import { fieldAt, sourceName } from './tables.ts';
import { span, tokenBefore } from '@mermaid-js/core/parser-kit/facet';

/**
 * The probed word's range: the prefix, plus the rest of the field's text after the cursor on
 * its line (a quoted name may run on over a line break; an edit stays on the cursor's line).
 */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  const kind = tokens?.kind[i];
  if (tokens && i >= 0 && (kind === T.Text || kind === T.EscapedText || kind === T.Sankey)) {
    const tokenEnd = tokens.end[i] ?? o;
    if (tokenEnd > o) end = lineEnd(text, o, tokenEnd);
    // A bare field is read trimmed: the blanks after its text stay.
    if (kind === T.Text) while (end > o && isFieldBlank(text.charAt(end - 1))) end--;
  }
  return span(probe.prefix.start, end);
}

/** The first line break in `[from, to)`, else `to`. */
function lineEnd(text: string, from: number, to: number): number {
  for (let k = from; k < to; k++) {
    const c = text.charAt(k);
    if (c === '\n' || c === '\r') return k;
  }
  return to;
}

/** The node names, in first-appearance order, with an occurrence away from `at`. */
function names(doc: DocumentView<SankeyDocument>, at: number): string[] {
  const out = new Set<string>();
  for (const s of doc.result.symbols) {
    if (s.kind !== 'node' || s.name === '') continue;
    if (s.range.start <= at && at <= s.range.end) continue;
    out.add(s.name);
  }
  return [...out];
}

export function sankeyCompletions(
  probe: ProbeResult,
  doc: DocumentView<SankeyDocument>
): CompletionItem[] {
  const expected = new Set(probe.expected);
  const { text, result } = doc;
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const out: CompletionItem[] = [];
  if (expected.has(T.Sankey) && 'sankey'.startsWith(prefix)) {
    const documentation = sankeyDocs[T.Sankey];
    out.push({
      label: 'sankey',
      kind: 'keyword',
      insertText: 'sankey',
      range,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  const quoted = expected.has(T.EscapedText);
  const tokens = result.tokens;
  if (!tokens || !(quoted || expected.has(T.Text))) return out;
  const field = fieldAt(text, tokens, range.start);
  if (field.index > 1) return out;
  const source = field.index === 1 ? sourceName(text, tokens, field.rowStart) : undefined;
  for (const name of names(doc, probe.offset)) {
    if (name === source) continue;
    const insertText = fieldText(name, quoted ? '"' : undefined);
    if (!(quoted ? insertText : name).startsWith(prefix)) continue;
    // A name quoted in a bare field takes the field's blanks (`  "a"` is no field).
    const at = !quoted && insertText !== name ? withFieldBlanks(text, range) : range;
    out.push({ label: name, kind: 'node', insertText, range: at });
  }
  return out;
}
