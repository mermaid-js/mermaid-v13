/**
 * Architecture completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to
 * items. An item is offered only where the parser tests its kind at the cursor:
 * `architecture-beta` at the start; the statements as the first word of a line; `row` and
 * `column` after `align`; `in` after a declaration's id, icon or label; the sides after an
 * edge end's `:` (and before the right-hand one's); the arrows after the left-hand side.
 *
 * Ids, from the model (so only ids v12 registered):
 * - after `in`, the groups: for a service or junction every group (v12 adds the groups first),
 *   for a group the ones declared before it, not itself;
 * - after `align row` or `align column`, the services and junctions not yet on the line;
 * - at the start of a line (an edge's left-hand end) and after the right-hand side's `:`, the
 *   services and junctions (an edge to a group id is an error, D504).
 *
 * Two items are read from the text, since the lexer has no token for half of one: `{group}`
 * after an edge end whose id is a service or junction in a group (where the parser tests for
 * it, or over a `{` typed there), and the built-in icon names after a service's or group's id,
 * written `(database)` (where the parser tests for an icon, or over a `(` typed there, closed
 * or not). Inside a text icon, a label, a `title`, `accTitle` or `accDescr` value (probe modes
 * `string`, `title`, `accTitle`, `accDescr`) and outside code nothing is offered.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { architectureDocs } from '../generated/docs.ts';
import type { ArchitectureModel } from '../model.ts';
import type { ArchitectureDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { atLineStart, BUILTIN_ICON_NAMES, ITEMS, lineBefore, span, tokenBefore } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the token after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0)) {
    end = tokens.end[i] ?? o;
    // An icon is replaced whole, its `)` included; other tokens up to a blank or punctuation.
    if (tokens.kind[i] !== T.Icon) {
      const stop = /[\s"':()[\]{}<>]/.exec(text.slice(o, end));
      if (stop) end = o + stop.index;
    }
  }
  return span(Math.min(probe.prefix.start, o), end);
}

/** The line's text from its start to `at`. */
function lineText(text: string, at: number): string {
  let i = at;
  while (i > 0 && text.charAt(i - 1) !== '\n' && text.charAt(i - 1) !== '\r') i--;
  return text.slice(i, at);
}

/** The end of the run of `chars` from `at`, then past `close` when it follows. */
function runEnd(text: string, at: number, chars: RegExp, close: string): number {
  let end = at;
  while (end < text.length && chars.test(text.charAt(end))) end++;
  return text.charAt(end) === close ? end + 1 : end;
}

interface Context {
  readonly text: string;
  readonly tokens: TokenStream;
  readonly model: ArchitectureModel;
  readonly ast: ArchitectureDocument;
  /** The significant tokens of the line before the word, first to last. */
  readonly before: readonly number[];
}

const kindOf = (c: Context, j: number | undefined): number =>
  j === undefined ? -1 : (c.tokens.kind[j] ?? -1);
const textOf = (c: Context, j: number): string =>
  c.text.slice(c.tokens.start[j] ?? 0, c.tokens.end[j] ?? 0);

/** Whether the line so far is an edge: it starts with an id. */
const inEdge = (c: Context): boolean => kindOf(c, c.before[0]) === T.Id;

/** Whether the line so far is `service id` or `group id`: where an icon goes. */
function iconPlace(c: Context, before: readonly number[]): boolean {
  const [first, id, ...rest] = before;
  const k = kindOf(c, first);
  return rest.length === 0 && (k === T.Service || k === T.Group) && kindOf(c, id) === T.Id;
}

/**
 * The id `{group}` would follow: the line's last token, an id that ends an edge's left-hand
 * end (the line's first token) or its right-hand end (after `:`).
 */
function groupMarkId(c: Context, before: readonly number[]): string | undefined {
  const last = before[before.length - 1];
  if (kindOf(c, last) !== T.Id || kindOf(c, before[0]) !== T.Id || last === undefined) {
    return undefined;
  }
  const lhs = before.length === 1;
  const rhs = kindOf(c, before[before.length - 2]) === T.Colon && before.length > 2;
  return lhs || rhs ? textOf(c, last) : undefined;
}

/** Whether `id` is a service or junction in a group: where `{group}` means something (D504). */
function grouped(model: ArchitectureModel, id: string): boolean {
  return [...model.services, ...model.junctions].some((e) => e.id === id && e.in !== undefined);
}

/** The built-in icons, written `(name)`. */
function icons(range: Range, prefix: string): CompletionItem[] {
  return BUILTIN_ICON_NAMES.map((name) => `(${name})`)
    .filter((label) => label.startsWith(prefix))
    .map((label) => ({
      label,
      kind: 'constant',
      insertText: label,
      range,
      detail: 'built-in icon',
    }));
}

/** `{group}`, documented. */
function groupMark(range: Range): CompletionItem {
  const documentation = architectureDocs[T.ArrowGroup];
  return {
    label: '{group}',
    kind: 'keyword',
    insertText: '{group}',
    range,
    ...(documentation === undefined ? {} : { documentation }),
  };
}

/** Completion over a `(` or `{` the lexer read as an error (an unfinished icon or `{group}`). */
function unfinished(c: Context, offset: number): CompletionItem[] | undefined {
  const line = lineText(c.text, offset);
  const paren = /\(([\w:-]*)$/.exec(line);
  const brace = /\{([a-z]*)$/.exec(line);
  const open = paren ?? brace;
  if (!open) return undefined;
  const at = offset - open[0].length;
  const before = lineBefore(c.tokens, at);
  if (paren) {
    if (!iconPlace(c, before)) return undefined;
    const range = span(at, runEnd(c.text, offset, /[\w:-]/, ')'));
    return icons(range, open[0]);
  }
  const id = groupMarkId(c, before);
  if (id === undefined || !grouped(c.model, id) || !'{group}'.startsWith(open[0])) return [];
  return [groupMark(span(at, runEnd(c.text, offset, /[a-z]/, '}')))];
}

/** Ids for the place: groups after `in`, members after `align`, edge ends elsewhere. */
function ids(c: Context, offset: number, lineStart: boolean): { id: string; kind: string }[] {
  const { model, ast } = c;
  const last = kindOf(c, c.before[c.before.length - 1]);
  const first = kindOf(c, c.before[0]);
  if (last === T.In) {
    if (first !== T.Group) return model.groups.map((g) => ({ id: g.id, kind: 'group' }));
    // A group's parent is declared before it, and is not the group itself.
    const own = c.before[1] === undefined ? undefined : textOf(c, c.before[1]);
    return model.groups
      .filter((g) => g.id !== own)
      .filter((g) => ast.children.some((n) => n.id === g.astId && n.range.end <= offset))
      .map((g) => ({ id: g.id, kind: 'group' }));
  }
  const nodes = [
    ...model.services.map((s) => ({ id: s.id, kind: 'service' })),
    ...model.junctions.map((j) => ({ id: j.id, kind: 'junction' })),
  ];
  if (first === T.Align && c.before.length >= 2) {
    const listed = new Set(c.before.slice(2).map((j) => textOf(c, j)));
    return nodes.filter((n) => !listed.has(n.id));
  }
  // An edge's ends: the first word of a line, and after the right-hand side's `:`.
  const rhs = last === T.Colon && kindOf(c, c.before[c.before.length - 2]) === T.Direction;
  return (lineStart || (rhs && inEdge(c))) && first !== T.Align ? nodes : [];
}

export function architectureCompletions(
  probe: ProbeResult,
  doc: DocumentView<ArchitectureDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const model = result.model as ArchitectureModel;
  const c0 = { text, tokens, model, ast: result.ast };
  const done = unfinished({ ...c0, before: [] }, probe.offset);
  if (done) return done;
  const expected = new Set(probe.expected);
  const range = wordRange(text, tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start);
  const c: Context = { ...c0, before: lineBefore(tokens, range.start) };
  const last = kindOf(c, c.before[c.before.length - 1]);
  const out: CompletionItem[] = [];
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (k.lineStart && !lineStart)) continue;
    // `<--` starts an edge's arrow, after its left-hand side; `<` elsewhere is the right end's.
    if (k.kind === T.ArrowInto && last !== T.Direction) continue;
    if (!k.label.startsWith(prefix)) continue;
    const documentation = architectureDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  if (expected.has(T.Icon) && iconPlace(c, c.before)) out.push(...icons(range, prefix));
  if (expected.has(T.ArrowGroup)) {
    const id = groupMarkId(c, c.before);
    if (id !== undefined && grouped(model, id) && '{group}'.startsWith(prefix)) {
      out.push(groupMark(range));
    }
  }
  if (expected.has(T.Id)) {
    for (const { id, kind } of ids(c, probe.offset, lineStart)) {
      if (!id.startsWith(prefix)) continue;
      out.push({
        label: id,
        kind: kind === 'group' ? 'subgraph' : 'node',
        insertText: id,
        range,
        detail: kind,
      });
    }
  }
  return out;
}
