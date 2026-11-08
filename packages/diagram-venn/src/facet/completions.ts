/**
 * Venn completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds, gated by the lexer
 * mode, and the statement the cursor is in, mapped to items.
 *
 * - At the start of a line (nothing but blanks before the word): `venn-beta` where the header
 *   goes, else the statement keywords the parser expects (`set`, `union`, `text`, `style`,
 *   `title`; `text` on an indented line under a `set` or `union` too).
 * - Where the parser expects an id: after `union` and its commas the sets declared before the
 *   statement; after `text` and its commas the declared sets; after `style` and its commas the
 *   declared sets, then, as the first target, the text nodes (one with a set's id would name the
 *   set). Ids already in the statement are left out; an id that is not a bare set id is
 *   inserted quoted (a style target takes no number). Nothing after `set` (a new id) or where a
 *   text node's own id goes (`text A |`).
 * - In a `style` statement, where a key goes (after the targets, or after a `,` that follows a
 *   value): the keys v12 reads, those the statement lacks, inserted as `key: `.
 *
 * Nothing in a quoted id or value, a label, a title, a comment, a directive or front matter.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { vennDocs } from '../generated/docs.ts';
import type { VennDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { invalidReason, quotedId } from './names.ts';
import { KEYWORDS, lineStartOf, lineTokens, span, STYLE_KEYS, tokenBefore } from './tables.ts';

/** The lexer modes in which the cursor is in code (jison's start conditions). */
const CODE_MODES = new Set(['INITIAL', 'bol']);
/** The keywords that start a statement whose ids completion reads. */
const STATEMENT_KEYWORDS = new Set<number>([
  T.Set,
  T.Union,
  T.Text,
  T.IndentTextKeyword,
  T.Style,
  T.Title,
  T.Venn,
]);

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0))
    end = tokens.end[i] ?? o;
  // A word stops at the first blank, line break, quote, bracket, `,` or `:` after the cursor.
  const stop = /[\s"[,:]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return span(probe.prefix.start, end);
}

/** Where in its statement the cursor is. */
type Place =
  | { kind: 'none' }
  | { kind: 'ids'; sets: 'before' | 'all'; texts: boolean; from: number; taken: Set<string> }
  | { kind: 'key'; taken: Set<string> };

const NONE: Place = { kind: 'none' };

/**
 * Read the statement the cursor at `at` is in from the tokens of its line before it: the last
 * statement keyword, and what came after it.
 */
function placeOf(doc: DocumentView<VennDocument>, tokens: TokenStream, at: number): Place {
  const before = lineTokens(doc.text, tokens, at);
  let k = before.length - 1;
  while (k >= 0 && !STATEMENT_KEYWORDS.has(tokens.kind[before[k] ?? 0] ?? Kind.EOF)) k--;
  if (k < 0) return NONE;
  const keyword = tokens.kind[before[k] ?? 0] ?? Kind.EOF;
  const from = tokens.start[before[k] ?? 0] ?? 0;
  const after = before.slice(k + 1);
  const kindAt = (n: number) => tokens.kind[after[n] ?? 0] ?? Kind.EOF;
  const last = after.length > 0 ? kindAt(after.length - 1) : keyword;
  const textOf = (j: number) => doc.text.slice(tokens.start[j] ?? 0, tokens.end[j] ?? 0);
  const ids = () => {
    const taken = new Set<string>();
    for (const j of after) {
      const kind = tokens.kind[j];
      if (kind === T.Identifier || kind === T.String) taken.add(unquote(textOf(j)));
    }
    return taken;
  };
  const atId = last === keyword || last === T.Comma;
  if (keyword === T.Union && atId) {
    return { kind: 'ids', sets: 'before', texts: false, from, taken: ids() };
  }
  if (keyword === T.Text && atId)
    return { kind: 'ids', sets: 'all', texts: false, from, taken: ids() };
  if (keyword !== T.Style) return NONE;
  const colon = after.findIndex((_, n) => kindAt(n) === T.Colon);
  if (colon < 0) {
    // A text node only as the one target: two or more ids name an overlap of sets.
    if (atId) return { kind: 'ids', sets: 'all', texts: last === keyword, from, taken: ids() };
    // After the targets: the first key.
    return { kind: 'key', taken: new Set() };
  }
  if (last !== T.Comma) return NONE;
  // After a value's `,`: another key; those written before a `:` are taken.
  const taken = new Set<string>();
  after.forEach((j, n) => {
    if (kindAt(n + 1) === T.Colon && tokens.kind[j] === T.Identifier) taken.add(textOf(j));
  });
  return { kind: 'key', taken };
}

/** An id token's name: v12's `normalizeText` of a quoted one. */
function unquote(raw: string): string {
  const t = raw.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
}

/** The declared set ids (`set` statements; before `before` when given) and text node ids. */
function declared(doc: DocumentView<VennDocument>, before?: number) {
  const sets = new Map<string, string | undefined>();
  const texts = new Map<string, string | undefined>();
  for (const n of doc.result.ast.children) {
    if (n.type === 'Set' && (before === undefined || n.range.start < before)) {
      if (!sets.has(n.name.name)) sets.set(n.name.name, n.label);
    } else if (n.type === 'Text' && !texts.has(n.name.name)) texts.set(n.name.name, n.label);
  }
  return { sets, texts };
}

export function vennCompletions(
  probe: ProbeResult,
  doc: DocumentView<VennDocument>
): CompletionItem[] {
  if (!CODE_MODES.has(probe.mode)) return [];
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const expected = new Set(probe.expected);
  const range = wordRange(text, tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const out: CompletionItem[] = [];
  const lineStart = /^[\t ]*$/.test(text.slice(lineStartOf(text, range.start), range.start));
  if (lineStart) {
    for (const k of KEYWORDS) {
      if (!k.kinds.some((kind) => expected.has(kind)) || !k.label.startsWith(prefix)) continue;
      const documentation = vennDocs[k.doc];
      out.push({
        label: k.label,
        kind: k.item,
        insertText: k.insert ?? k.label,
        range,
        ...(documentation === undefined ? {} : { documentation }),
      });
    }
    if (out.length > 0) return out;
  }
  const place = placeOf(doc, tokens, range.start);
  if (place.kind === 'ids' && expected.has(T.Identifier)) {
    const { sets, texts } = declared(doc, place.sets === 'before' ? place.from : undefined);
    const add = (name: string, label: string | undefined, what: string) => {
      if (place.taken.has(name) || !name.startsWith(prefix)) return;
      out.push({
        label: name,
        kind: 'node',
        insertText: invalidReason(name) === undefined ? name : (quotedId(name) ?? name),
        range,
        detail: label === undefined ? what : `${what} · ${label}`,
      });
    };
    for (const [name, label] of sets) add(name, label, 'set');
    if (place.texts)
      for (const [name, label] of texts) if (!sets.has(name)) add(name, label, 'text node');
  } else if (place.kind === 'key' && expected.has(T.Identifier)) {
    for (const [key, documentation] of STYLE_KEYS) {
      if (place.taken.has(key) || !key.startsWith(prefix)) continue;
      out.push({ label: key, kind: 'property', insertText: `${key}: `, range, documentation });
    }
  }
  return out;
}
