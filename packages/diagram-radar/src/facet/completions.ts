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
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { radarDocs } from '../generated/docs.ts';
import type { RadarDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { declaredAxes, ITEMS, tokenBefore } from './tables.ts';
import { atLineStart, keywordCompletions, wordRange } from '@mermaid-js/shared/parser/facet';

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

export function radarCompletions(
  probe: ProbeResult,
  doc: DocumentView<RadarDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe, /[\s"':,[\]{}]/);
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start);
  const out = keywordCompletions(
    ITEMS,
    expected,
    prefix,
    range,
    radarDocs,
    (k) => !k.lineStart || lineStart
  );
  if (expected.has(T.Id) && inBraces(result.tokens, range.start)) {
    for (const [name, [a]] of declaredAxes(result.ast)) {
      if (!a || !name.startsWith(prefix)) continue;
      const detail = a.label === undefined ? 'axis' : `axis ${JSON.stringify(a.label)}`;
      out.push({ label: a.name, kind: 'node', insertText: a.name, range, detail });
    }
  }
  return out;
}
