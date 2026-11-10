/**
 * C4 completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds, and the macro call
 * around the cursor read from the tokens (`args.ts`), mapped to items.
 *
 * - The five headers where the parser expects the header (the first line).
 * - The macros at a statement start (nothing but blanks before the word on its line), each
 *   with its signature; the `(` is inserted too unless one follows.
 * - In a macro's arguments: after `$`, the names of the macro's slots not given yet (by name
 *   or by position); in a relation end or an `Update…Style` target, the aliases of the
 *   elements and boundaries (an element where both have the alias, as v12 looks them up).
 *
 * Nothing in labels and the other text slots, comments, directives or front matter. Keywords
 * and aliases are matched without regard to case; the lexer reads them case-sensitively, so
 * the item writes them as they are.
 */
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
} from '@mermaid-js/core/parser-kit';
import { c4Docs } from '../generated/docs.ts';
import type { C4Document, C4StatementNode } from '../parser/ast.ts';
import { HEADERS, KEYWORDS, T } from '../parser/tokens.ts';
import { callAt } from './args.ts';
import type { CallAt, WrittenArg } from './args.ts';
import { lineBefore, requiredSlots, signature, SLOTS, span } from './tables.ts';

const BLANK = /^[\t ]*$/;
const LINE_BREAK = /[\n\r]/;
const KEYWORD_LIST = [...KEYWORDS];
const HEADER_NAMES = KEYWORD_LIST.filter(([, k]) => HEADERS.has(k));
const MACRO_NAMES = KEYWORD_LIST.filter(([, k]) => !HEADERS.has(k));
/** Slots a `$name` is not offered for: the ones a statement writes by position. */
const POSITIONAL = new Set(['label', 'index']);

const matches = (label: string, typed: string) =>
  label.toLowerCase().startsWith(typed.toLowerCase());

/** The headers or the macros for the word at the probe, at a line start. */
function keywordItems(probe: ProbeResult, text: string, headers: boolean): CompletionItem[] {
  const { offset } = probe;
  const start = probe.prefix.start;
  const typed = text.slice(start, offset);
  if (!BLANK.test(lineBefore(text, start)) || !/^\w*$/.test(typed)) return [];
  const rest = /^\w*/.exec(text.slice(offset))?.[0] ?? '';
  const range = span(start, offset + rest.length);
  const paren = text.charAt(range.end) === '(';
  const out: CompletionItem[] = [];
  for (const [name, kind] of headers ? HEADER_NAMES : MACRO_NAMES) {
    if (!matches(name, typed)) continue;
    const documentation = c4Docs[kind];
    const slots = SLOTS.get(kind);
    out.push({
      label: name,
      kind: 'keyword',
      insertText: headers || paren ? name : `${name}(`,
      range,
      ...(slots === undefined ? {} : { detail: signature(name, slots, requiredSlots(kind)) }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}

/** The `$name`s the macro takes and the call has not given, for the name at the cursor. */
function nameItems(call: CallAt, arg: WrittenArg, name: Range, text: string, at: number) {
  if (at < name.start) return [];
  const typed = text.slice(name.start, at);
  if (!/^\w*$/.test(typed)) return [];
  const rest = /^\w*/.exec(text.slice(at))?.[0] ?? '';
  const range = span(name.start, at + rest.length);
  const equals = /^[ ]*=/.test(text.slice(range.end));
  const slots = SLOTS.get(call.kind) ?? [];
  const given = new Set<string>();
  call.args.forEach((a, k) => {
    if (a === arg) return;
    if (a.name) given.add(text.slice(a.name.start, a.name.end).trim());
    else given.add(slots[k]?.name ?? '');
  });
  return slots
    .filter((s) => s.role === 'text' && !POSITIONAL.has(s.name) && !given.has(s.name))
    .filter((s) => matches(s.name, typed))
    .map(
      (s): CompletionItem => ({
        label: s.name,
        kind: 'property',
        insertText: equals ? s.name : `${s.name}="`,
        range,
      })
    );
}

/** Each alias defined in the document, an element where a boundary has it too, first first. */
function aliases(doc: DocumentView<C4Document>): Map<string, { kind: string; macro: string }> {
  const macros = new Map<string, string>();
  const walk = (list: readonly C4StatementNode[]) => {
    for (const n of list) {
      if (n.type === 'Element' || n.type === 'Boundary') {
        const key = `${n.type === 'Element' ? 'element' : 'boundary'} ${n.alias}`;
        if (!macros.has(key)) macros.set(key, n.macro);
      }
      if (n.type === 'Boundary') walk(n.children);
    }
  };
  walk(doc.result.ast.children);
  const out = new Map<string, { kind: string; macro: string }>();
  for (const s of doc.result.symbols) {
    if (s.role !== 'def' || (s.kind !== 'element' && s.kind !== 'boundary')) continue;
    if (out.get(s.name)?.kind === 'element') continue;
    out.set(s.name, { kind: s.kind, macro: macros.get(`${s.kind} ${s.name}`) ?? '' });
  }
  return out;
}

/** Where the alias being typed goes, and what of it is typed; undefined where none goes. */
function aliasPlace(arg: WrittenArg | undefined, text: string, at: number) {
  if (arg === undefined || (arg.value === undefined && !arg.quoted)) {
    return { range: span(at, at), typed: '', quoted: false };
  }
  const value = arg.value;
  if (value === undefined) return undefined;
  let start = value.start;
  if (!arg.quoted) while (start < at && /[\t ]/.test(text.charAt(start))) start++;
  if (at < start || at > value.end) return undefined;
  const stop = arg.quoted ? /^[^"\n\r]*/ : /^[^,)\n\r]*/;
  let end = at + (stop.exec(text.slice(at))?.[0].length ?? 0);
  while (end > at && /[\t ]/.test(text.charAt(end - 1))) end--;
  return { range: span(start, end), typed: text.slice(start, at), quoted: arg.quoted };
}

/** The aliases for a relation end or a style target at the cursor. */
function aliasItems(call: CallAt, doc: DocumentView<C4Document>, at: number): CompletionItem[] {
  const slot = SLOTS.get(call.kind)?.[call.index];
  if (slot?.role !== 'reference' || call.at?.name !== undefined) return [];
  const place = aliasPlace(call.at, doc.text, at);
  if (!place) return [];
  const out: CompletionItem[] = [];
  for (const [name, { kind, macro }] of aliases(doc)) {
    if (!matches(name, place.typed)) continue;
    // A name the slot cannot hold as it is written there.
    if (place.quoted ? name.includes('"') : /[,)\n\r]|^[\t "$]/.test(name)) continue;
    const item: CompletionKind = kind === 'element' ? 'node' : 'subgraph';
    out.push({
      label: name,
      kind: item,
      insertText: name,
      range: place.range,
      ...(macro === '' ? {} : { detail: macro }),
    });
  }
  return out;
}

export function c4Completions(probe: ProbeResult, doc: DocumentView<C4Document>): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const { mode, offset } = probe;
  if (mode === 'comment' || mode === 'directive' || mode === 'frontMatter') return [];
  const call = callAt(tokens, text, offset);
  if (call) {
    const arg = call.at;
    const items = arg?.name
      ? nameItems(call, arg, arg.name, text, offset)
      : aliasItems(call, doc, offset);
    // Each item replaces text on the cursor's line (an argument in quotes may span lines).
    return items.filter((i) => !LINE_BREAK.test(text.slice(i.range.start, i.range.end)));
  }
  const expected = new Set(probe.expected);
  if (HEADER_NAMES.some(([, k]) => expected.has(k))) return keywordItems(probe, text, true);
  if (expected.has(T.Person)) return keywordItems(probe, text, false);
  return [];
}
