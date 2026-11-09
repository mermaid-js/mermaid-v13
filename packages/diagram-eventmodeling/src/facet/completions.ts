/**
 * Event modeling completion (DESIGN §4.5, D95, R-LANG-7, spec #527 "Language facet (T6)"): the
 * probe's expected kinds mapped to items. An item is offered only where the parser tests its
 * kind: `eventmodeling` at the start; the statements where one may start (`title`, `accTitle`
 * and `accDescr` only after a blank behind an earlier token on the line, where the lexer reads
 * them); the kinds after a frame id and in a `gwt`; `->>` after a frame's name or sources; the
 * data types after a backtick; `given`, `when` and `then` in a `gwt`. Symbols: the earlier
 * frames' ids after `->>`, every frame's id after `note` and `gwt`, the data block names
 * inside `[[ ]]` and the entity names in a `gwt` step. Inside data, a comment, a statement's
 * text (probe modes `data`, `comment`, `title`, …) and outside code nothing is offered.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { eventmodelingDocs } from '../generated/docs.ts';
import type { EventModelDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { frameNodes, ITEMS, KIND_KINDS, kindsBefore, span, tokenBefore } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the token the cursor is in. */
function wordRange(tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0)) {
    const k = tokens.kind[i];
    if (k === T.Id || k === T.FrameId || (k !== undefined && KIND_KINDS.has(k))) {
      end = tokens.end[i] ?? o;
    }
  }
  return span(probe.prefix.start, end);
}

/**
 * Whether `at` follows a blank that follows a non-blank on its line: where the lexer reads
 * ` title`, ` accTitle` and ` accDescr` (at a line start, or glued to a token, they are names).
 */
function afterBlank(text: string, at: number): boolean {
  let i = at;
  while (i > 0 && (text.charAt(i - 1) === ' ' || text.charAt(i - 1) === '\t')) i--;
  return i < at && i > 0 && !/[\n\r\u2028\u2029]/.test(text.charAt(i - 1));
}

export function eventModelingCompletions(
  probe: ProbeResult,
  doc: DocumentView<EventModelDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const out: CompletionItem[] = [];
  const blank = afterBlank(text, range.start);
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (k.afterBlank && !blank)) continue;
    if (!k.label.startsWith(prefix)) continue;
    const documentation = eventmodelingDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  symbolItems(out, expected, result.ast, kindsBefore(result.tokens, range.start, 2), range, prefix);
  return out;
}

/**
 * The frame ids, data names and entity names the parser takes at the probe, appended to `out`:
 * by the expected kind and the tokens before the word (`last` the one right before it).
 */
function symbolItems(
  out: CompletionItem[],
  expected: ReadonlySet<number>,
  ast: EventModelDocument,
  [last, second]: number[],
  range: Range,
  prefix: string
): void {
  const symbol = (label: string, detail: string): void => {
    if (!label.startsWith(prefix) || out.some((c) => c.label === label)) return;
    out.push({ label, kind: 'value', insertText: label, range, detail });
  };
  if (expected.has(T.FrameId) && (last === T.Arrow || last === T.Note || last === T.Gwt)) {
    // A source comes before the frame that names it (a later one draws no relation).
    for (const f of frameNodes(ast)) {
      if (last === T.Arrow && f.range.end > range.start) continue;
      symbol(f.frame.value, `${f.kind.value} ${f.name.value}`);
    }
  }
  if (expected.has(T.Id) && last === T.OpenRef) {
    for (const n of ast.children) if (n.type === 'Data') symbol(n.name.value, 'data');
  }
  // A `gwt` step: a kind not right after a frame id (that is a frame's name).
  if (expected.has(T.Id) && last !== undefined && KIND_KINDS.has(last) && second !== T.FrameId) {
    // A step names one entity without a `.`.
    for (const n of ast.children) {
      if (n.type === 'Entity' && !n.name.value.includes('.')) symbol(n.name.value, 'entity');
    }
  }
}
