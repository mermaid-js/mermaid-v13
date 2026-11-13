/**
 * Event modeling completion (DESIGN §4.5, D95, R-LANG-7, spec #527 "Language facet (T6)"): the
 * probe's expected kinds mapped to items. An item is offered only where the parser tests its
 * kind: `eventmodeling` at the start; the statements where one may start (`title`, `accTitle`
 * and `accDescr` only after a blank behind an earlier token on the line, where the lexer reads
 * them); the kinds after a frame id and in a `gwt`; `->>` after a frame's name or sources; the
 * data types after a backtick; `given`, `when` and `then` in a `gwt`. Symbols: the earlier
 * frames' ids and the frame's own after `->>`, every frame's id after `note` and `gwt`, the data block names
 * inside `[[ ]]` and the entity names in a `gwt` step. Inside data, a comment, a statement's
 * text (probe modes `data`, `comment`, `title`, …) and outside code nothing is offered.
 */
import { tokenText } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { span, tokenBefore } from '@mermaid-js/core/parser-kit/facet';
import { eventmodelingDocs } from '../generated/docs.ts';
import type { EventModelDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { frameNodes, ITEMS, KIND_KINDS, kindsBefore } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the word token the cursor is in. */
function wordRange(tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  // A word (a name, a frame id or a keyword) is replaced whole; data and text are not words.
  const inWord =
    tokens !== undefined &&
    i >= 0 &&
    (tokens.start[i] ?? 0) < o &&
    o < (tokens.end[i] ?? 0) &&
    /^\w+$/.test(tokenText(tokens, i));
  return span(probe.prefix.start, inWord ? (tokens.end[i] ?? o) : o);
}

/**
 * Whether only blanks, at least one, lie between the end of the token before `at` and `at`:
 * where the lexer reads ` title`, ` accTitle` and ` accDescr` (the blanks start their token).
 * After a line break the lexer skips it with the blanks after it, so they are names there;
 * a data block or `---` block takes the line break after its closer, so after one they are
 * read.
 */
function afterBlank(text: string, tokens: TokenStream | undefined, at: number): boolean {
  if (!tokens) return false;
  for (let j = tokenBefore(tokens, at); j >= 0; j--) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start === end || end > at) continue;
    return /^[\t ]+$/.test(text.slice(end, at));
  }
  return false;
}

/** `insert` without its trailing blank where a blank follows the replaced range already. */
function fitted(insert: string, text: string, range: Range): string {
  const next = text.charAt(range.end);
  return insert.endsWith(' ') && (next === ' ' || next === '\t') ? insert.slice(0, -1) : insert;
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
  const blank = afterBlank(text, result.tokens, range.start);
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (k.afterBlank && !blank)) continue;
    if (!k.label.startsWith(prefix)) continue;
    const documentation = eventmodelingDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: fitted(k.insert ?? k.label, text, range),
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  const before = kindsBefore(result.tokens, range.start, 2);
  symbolItems(out, expected, result.ast, before, range, prefix);
  if (expected.has(T.FrameId) && before[0] === T.Arrow) {
    // The frame itself: v12 draws a relation from a frame named as its own source.
    const own = ownFrameId(result.tokens, range.start);
    if (own !== undefined && own.startsWith(prefix) && !out.some((c) => c.label === own)) {
      out.push({ label: own, kind: 'value', insertText: own, range, detail: 'this frame' });
    }
  }
  return out;
}

/**
 * The id of the frame whose `->>` sources run up to `at`: the frame id after the last frame
 * keyword before it, if no other statement starts between them.
 */
function ownFrameId(tokens: TokenStream | undefined, at: number): string | undefined {
  if (!tokens) return undefined;
  for (let j = tokenBefore(tokens, at); j >= 0; j--) {
    if ((tokens.start[j] ?? 0) >= at) continue;
    const k = tokens.kind[j] ?? -1;
    if (FRAME_KEYWORDS.has(k)) {
      return tokens.kind[j + 1] === T.FrameId ? tokenText(tokens, j + 1) : undefined;
    }
    if (OTHER_STARTS.has(k)) return undefined;
  }
  return undefined;
}

const FRAME_KEYWORDS = new Set<number>([T.Tf, T.Timeframe, T.Rf, T.Resetframe]);
const OTHER_STARTS = new Set<number>([
  T.Entity,
  T.Data,
  T.Note,
  T.Gwt,
  T.Title,
  T.AccTitle,
  T.AccDescr,
]);

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
