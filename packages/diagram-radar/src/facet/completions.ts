/**
 * Radar completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * An item is offered only when the parser tests its kind at the cursor: `radar-beta` at the
 * start; the statements as the first word of a line; `true`/`false` after `showLegend` and
 * `circle`/`polygon` after `graticule`; inside a curve's `{ }`, where a detailed entry's name
 * may go, the declared axis names. Inside a label or a statement's text (probe modes `string`,
 * `title`, `accTitle`, `accDescr`) and outside code nothing is offered.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { radarDocs } from '../generated/docs.ts';
import type { RadarAxisNode, RadarDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { ITEMS, span, tokenBefore } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0))
    end = tokens.end[i] ?? o;
  // A word stops at the first blank, line break, quote or punctuation after the cursor.
  const stop = /[\s"':,[\]{}]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return span(probe.prefix.start, end);
}

/** Whether only blanks come before `at` on its line. */
function atLineStart(text: string, at: number): boolean {
  let i = at;
  while (i > 0 && (text.charAt(i - 1) === ' ' || text.charAt(i - 1) === '\t')) i--;
  return i === 0 || text.charAt(i - 1) === '\n' || text.charAt(i - 1) === '\r';
}

/** Whether `at` is inside a curve's `{ }`: the last brace before it is a `{`. */
function inBraces(tokens: TokenStream | undefined, at: number): boolean {
  if (!tokens) return false;
  for (let j = tokenBefore(tokens, at); j >= 0; j--) {
    if ((tokens.end[j] ?? 0) > at) continue;
    const k = tokens.kind[j];
    if (k === T.LBrace) return true;
    if (k === T.RBrace) return false;
  }
  return false;
}

/** The declared axes, one per name (the first), in source order. */
function declaredAxes(doc: RadarDocument): RadarAxisNode[] {
  const seen = new Map<string, RadarAxisNode>();
  for (const n of doc.children) if (n.type === 'Axis' && !seen.has(n.name)) seen.set(n.name, n);
  return [...seen.values()];
}

export function radarCompletions(
  probe: ProbeResult,
  doc: DocumentView<RadarDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start);
  const out: CompletionItem[] = [];
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (k.lineStart && !lineStart)) continue;
    if (!k.label.startsWith(prefix)) continue;
    const documentation = radarDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  if (expected.has(T.Id) && inBraces(result.tokens, range.start)) {
    for (const a of declaredAxes(result.ast)) {
      if (!a.name.startsWith(prefix)) continue;
      const detail = a.label === undefined ? 'axis' : `axis ${JSON.stringify(a.label)}`;
      out.push({ label: a.name, kind: 'node', insertText: a.name, range, detail });
    }
  }
  return out;
}
