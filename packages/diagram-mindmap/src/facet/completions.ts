/**
 * Mindmap completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and the line
 * around the cursor, mapped to items.
 *
 * - `mindmap` where the parser expects the header.
 * - At a statement start (nothing but the indent before the cursor on its line), once a node is
 *   written above: `::icon()` and `:::`, the decorations of that node.
 * - Right after a node id that ends its line: the id in each of the six shapes (`a` to `a[a]`,
 *   `a((a))`, …), replacing it; the shape name is the detail.
 * - In a shape, after its text at the end of the line: the closer its opener is written with.
 * - In a `:::` line: the class names the diagram uses elsewhere, for the word at the cursor.
 *
 * Nothing in a string, an icon, a comment, a directive or front matter, and nothing where the
 * parser reported an error at the cursor (a node after two blank lines, as in v12). Labels are
 * matched without regard to case, as the lexer reads `mindmap` and `::icon(`.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { mindmapDocs } from '../generated/docs.ts';
import type { MindmapDocument } from '../parser/ast.ts';
import { mindmapTokens } from '../parser/index.ts';
import { T } from '../parser/tokens.ts';
import { CLOSER_OF, lineAfter, lineBefore, SHAPES, span } from './tables.ts';

const BLANK = /^[\t ]*$/;
/** A class word's end: the blanks a `:::` line is split at. */
const CLASS_BLANK = /[\t\n\f\r ]/;

/**
 * The index of the last token of `kinds` in `tokens` that holds `at` (starts at or before it,
 * ends at or after it), or -1.
 */
function tokenAt(tokens: TokenStream, at: number, kinds: readonly number[]): number {
  let found = -1;
  for (let j = 0; j < tokens.length; j++) {
    if ((tokens.start[j] ?? 0) > at) break;
    if (at <= (tokens.end[j] ?? 0) && kinds.includes(tokens.kind[j] ?? Kind.EOF)) found = j;
  }
  return found;
}

/**
 * The class names used in `doc`, first use first, but not those of `line` (the `:::` line
 * being written) other than `word` (the one at the cursor, which an item may replace).
 */
function classNames(doc: DocumentView<MindmapDocument>, line: Range, word: Range): string[] {
  const out = new Set<string>();
  const taken = new Set<string>();
  for (const s of doc.result.symbols) {
    if (s.kind !== 'class') continue;
    const inLine = line.start <= s.range.start && s.range.end <= line.end;
    const atCursor = s.range.start === word.start && s.range.end === word.end;
    if (inLine && !atCursor) taken.add(s.name);
    else if (!inLine) out.add(s.name);
  }
  return [...out].filter((name) => !taken.has(name));
}

/** The class names for the word at the cursor in a `:::` line, or undefined when not in one. */
function classItems(
  doc: DocumentView<MindmapDocument>,
  tokens: TokenStream,
  at: number
): CompletionItem[] | undefined {
  const { text } = doc;
  const j = tokenAt(tokens, at, [T.Class, T.ClassStart]);
  if (j < 0) return undefined;
  const start = tokens.start[j] ?? 0;
  const end = tokens.end[j] ?? 0;
  // `:::` itself: the cursor is in it, not after it.
  if (tokens.kind[j] === T.ClassStart && at < end) return undefined;
  let from = at;
  while (from > start && !CLASS_BLANK.test(text.charAt(from - 1))) from--;
  let to = at;
  while (to < end && !CLASS_BLANK.test(text.charAt(to))) to++;
  if (tokens.kind[j] === T.ClassStart) from = to = at;
  const prefix = text.slice(from, at);
  const range = span(from, to);
  return classNames(doc, span(start, end), range)
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ label: name, kind: 'class', insertText: name, range }));
}

/** The closer of the shape the cursor is in, after its text at the end of the line. */
function closerItems(probe: ProbeResult, tokens: TokenStream, text: string): CompletionItem[] {
  const expected = new Set(probe.expected);
  if (!expected.has(T.NodeDEnd) && !expected.has(T.NodeDescr)) return [];
  if (!BLANK.test(lineAfter(text, probe.offset))) return [];
  let open = -1;
  for (let j = 0; j < tokens.length && (tokens.end[j] ?? 0) <= probe.offset; j++) {
    if (tokens.kind[j] === T.NodeDStart) open = j;
  }
  if (open < 0) return [];
  const opener = text.slice(tokens.start[open] ?? 0, tokens.end[open] ?? 0);
  // Text is needed first: an empty shape is an error.
  if (BLANK.test(text.slice(tokens.end[open] ?? 0, probe.offset).replace(/[\n\r]/g, ''))) return [];
  const close = CLOSER_OF[opener];
  if (close === undefined) return [];
  const name = SHAPES.find((s) => s.open === opener)?.name ?? 'default';
  const at = span(probe.offset, probe.offset);
  return [{ label: close, kind: 'shape', insertText: close, range: at, detail: name }];
}

/** A line holding a node at a statement start, to lex an item alone (one short lex). */
const SAMPLE = 'mindmap\n  root\n    ';

/**
 * Whether `parts`, written at a statement start, lexes as exactly those tokens in that order
 * (`[kind, text]`), with nothing after them on the line: the node the item names.
 */
function readsAs(parts: readonly (readonly [number, string])[]): boolean {
  const written = parts.map(([, t]) => t).join('');
  const tokens = mindmapTokens(SAMPLE + written);
  let at = SAMPLE.length;
  let k = tokens.findIndex((t) => t.range.start === at);
  if (k < 0) return false;
  for (const [kind, text] of parts) {
    const t = tokens[k++];
    if (t?.kind !== kind || t.range.start !== at || t.range.end !== at + text.length) return false;
    at = t.range.end;
  }
  const next = tokens[k];
  return next === undefined || next.kind === Kind.Newline || next.kind === T.Eof;
}

/**
 * The six shapes around the id at `range`, replacing it, each kept only where v12 reads it as
 * that shape with that text: the text is quoted when it would not read bare (`q]` →
 * `q]["q]"]`, `-q` → `-q("-q")`), and an item that reads as neither is dropped.
 */
function shapeItems(id: string, range: Range): CompletionItem[] {
  const out: CompletionItem[] = [];
  for (const { open, close, name } of SHAPES) {
    const head = [T.NodeId, id] as const;
    const bare = [head, [T.NodeDStart, open], [T.NodeDescr, id], [T.NodeDEnd, close]] as const;
    const quoted = [
      head,
      [T.NodeDStart, open],
      [T.StringStart, '"'],
      [T.NodeDescr, id],
      [T.StringEnd, '"'],
      [T.NodeDEnd, close],
    ] as const;
    let label: string | undefined;
    if (readsAs(bare)) label = `${id}${open}${id}${close}`;
    else if (!id.includes('"') && readsAs(quoted)) label = `${id}${open}"${id}"${close}`;
    if (label !== undefined)
      out.push({ label, kind: 'shape', insertText: label, range, detail: name });
  }
  return out;
}

export function mindmapCompletions(
  probe: ProbeResult,
  doc: DocumentView<MindmapDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const { mode, offset } = probe;
  if (mode === 'NODE') return closerItems(probe, tokens, text);
  if (mode !== 'INITIAL' && mode !== 'CLASS') return [];
  const classes = classItems(doc, tokens, offset);
  if (classes) return classes;
  if (mode !== 'INITIAL') return [];

  const expected = new Set(probe.expected);
  const start = probe.prefix.start;
  const prefix = text.slice(start, offset);
  if (!BLANK.test(lineBefore(text, start, true)) || /[\n\r]/.test(prefix)) return [];
  const lower = prefix.toLowerCase();
  const word = /^[^\s()[\]{}]*/.exec(text.slice(offset))?.[0] ?? '';
  const range = span(start, prefix === '' ? offset : offset + word.length);
  const out: CompletionItem[] = [];
  const keyword = (
    label: string,
    insertText: string,
    kind: number,
    item: 'keyword' | 'operator'
  ) => {
    if (!label.toLowerCase().startsWith(lower)) return;
    const documentation = mindmapDocs[kind];
    out.push({
      label,
      kind: item,
      insertText,
      range,
      ...(documentation === undefined ? {} : { documentation }),
    });
  };
  if (expected.has(T.Mindmap)) {
    keyword('mindmap', 'mindmap', T.Mindmap, 'keyword');
    return out;
  }
  if (!expected.has(T.NodeId)) return out;
  // The decorations of the node above: none before the first node (an error in v12).
  if (result.ast.children.some((n) => n.range.end <= start)) {
    keyword('::icon()', '::icon()', T.IconStart, 'operator');
    keyword(':::', ':::', T.ClassStart, 'operator');
  }
  // An id that ends its line: the shapes around it.
  const j = tokenAt(tokens, offset, [T.NodeId]);
  const id = prefix.trimEnd();
  if (
    j >= 0 &&
    tokens.start[j] === start &&
    id !== '' &&
    id === prefix &&
    !id.startsWith(':') &&
    BLANK.test(lineAfter(text, offset))
  ) {
    out.push(...shapeItems(id, span(start, offset)));
  }
  return out;
}
