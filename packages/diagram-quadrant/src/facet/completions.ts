/**
 * Quadrant completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode
 * mapped to items. Keywords are offered only where the parser tests their kind; the statement
 * before the cursor tells the rest apart: `-->` after an axis's start label, class names after
 * `:::` and as a `classDef` name, style keys after a point's `]` and a `classDef` name (not in
 * a style's value), inserted with an example value since a key alone is an error. Inside text values (`title`, `accTitle:`, `accDescr`, strings) and
 * coordinates nothing is offered.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { quadrantCategories } from '../generated/categories.ts';
import { quadrantDocs } from '../generated/docs.ts';
import type { QuadrantDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { readsAs } from './names.ts';
import { KEYWORDS, STYLE_KEYS } from './tables.ts';
import { span, tokenBefore } from '@mermaid-js/core/parser-kit/facet';

/** Modes whose text is a value, not code: nothing is offered there. */
const VALUE_MODES = new Set([
  'title',
  'acc_title',
  'acc_descr',
  'acc_descr_multiline',
  'md_string',
  'string',
  'point_start',
  'point_x',
  'point_y',
  'comment',
  'directive',
  'frontMatter',
]);
/** Where a statement ends. */
const STATEMENT_END = new Set<number>([Kind.Newline, Kind.EOF, T.Semi, T.Eof]);
const WORD_KINDS = new Set<number>([T.Alpha, T.Num, T.UnicodeText, T.ClassName, T.Minus]);
/** Ids, keywords and words of text: a cursor inside one replaces all of it. */
const isWord = (kind: number) => WORD_KINDS.has(kind) || quadrantCategories[kind] === 'Keyword';

/** Items filtered by the typed prefix, one per label. */
class Items {
  readonly list: CompletionItem[] = [];
  private readonly seen = new Set<string>();

  constructor(
    readonly prefix: string,
    private readonly range: Range
  ) {}

  add(label: string, kind: CompletionKind, extra: Partial<CompletionItem> = {}): void {
    if (!label.startsWith(this.prefix) || this.seen.has(label)) return;
    this.seen.add(label);
    this.list.push({ label, kind, insertText: label, range: this.range, ...extra });
  }
}

/** The significant tokens of the statement the cursor is in, up to the word being typed. */
function statementBefore(tokens: TokenStream, at: number): number[] {
  const kinds: number[] = [];
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    if ((tokens.end[i] ?? 0) > at) continue;
    if (STATEMENT_END.has(k)) break;
    if (k === Kind.Comment || k === Kind.Directive) continue;
    kinds.push(k);
  }
  // The blanks before the statement are not part of it.
  while (kinds[kinds.length - 1] === T.Space) kinds.pop();
  return kinds.reverse();
}

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokenBefore(tokens, o);
  if (i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0) && isWord(tokens.kind[i]!))
    end = tokens.end[i] ?? o;
  // Padded keywords take the blanks after them: the word stops at the first blank.
  const blank = /\s/.exec(text.slice(o, end));
  if (blank) end = o + blank.index;
  return span(probe.prefix.start, end);
}

/** Keywords whose kind the parser tests at the cursor. */
function keywords(items: Items, expected: ReadonlySet<number>): void {
  if (expected.has(T.Quadrant)) {
    items.add('quadrantChart', 'keyword', { documentation: quadrantDocs[T.Quadrant] ?? '' });
  }
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind)) continue;
    const documentation = quadrantDocs[k.kind];
    items.add(k.label, 'keyword', {
      insertText: k.insert ?? k.label,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
}

/**
 * Class names the document uses that read back where they are inserted (`role`: after `:::`, a
 * `ref`; after `classDef`, a `def`), leaving out the word being typed.
 */
function classes(
  items: Items,
  doc: DocumentView<QuadrantDocument>,
  except: number,
  role: 'def' | 'ref'
): void {
  const checked = new Map<string, boolean>();
  for (const s of doc.result.symbols) {
    if (s.kind !== 'class' || s.range.start === except || !s.name.startsWith(items.prefix))
      continue;
    let ok = checked.get(s.name);
    if (ok === undefined) checked.set(s.name, (ok = readsAs(s.name, role)));
    if (ok) items.add(s.name, 'class');
  }
}

/** Whether `-->` is already written at or right after the cursor. */
function arrowAfter(text: string, tokens: TokenStream, at: number): boolean {
  if (/^[ ]*-+>/.test(text.slice(at))) return true;
  const i = tokenBefore(tokens, at);
  return i >= 0 && tokens.kind[i] === T.AxisTextDelimiter && at < (tokens.end[i] ?? 0);
}

/**
 * `accTitle ¦` and `accDescr ¦`: the word lexes as a label until `:` (or `{`) follows it, so
 * those are what may come next.
 */
function accSeparators(items: Items, text: string, at: number): void {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n;]/.test(text.charAt(lineStart - 1))) lineStart--;
  const m = /^\s*(accTitle|accDescr)\s+$/i.exec(text.slice(lineStart, at));
  if (!m) return;
  const descr = /^accDescr$/i.test(m[1]!);
  const documentation = quadrantDocs[descr ? T.AccDescr : T.AccTitle] ?? '';
  items.add(':', 'operator', { insertText: ': ', documentation });
  if (descr) items.add('{', 'operator', { insertText: '{', documentation });
}

/** Style keys, unless the cursor is in a style's value (after its `:`). */
function styleKeys(items: Items, st: readonly number[], from: number): void {
  let start = from;
  for (let i = from; i < st.length; i++) if (st[i] === T.Comma) start = i + 1;
  if (st.slice(start).includes(T.Colon)) return;
  for (const [key, insertText, detail] of STYLE_KEYS)
    items.add(key, 'property', { insertText, detail });
}

/** Where a `classDef`'s styles start in its statement tokens (after the blank after the name). */
function classDefStyles(st: readonly number[]): number | undefined {
  let blanks = 0;
  for (let i = 1; i < st.length; i++) {
    if (st[i] === T.Space && ++blanks === 2) return i + 1;
  }
  return undefined;
}

export function quadrantCompletions(
  probe: ProbeResult,
  doc: DocumentView<QuadrantDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens || VALUE_MODES.has(probe.mode)) return [];
  const expected = new Set(probe.expected);
  if (expected.size === 0) return [];
  const range = wordRange(text, tokens, probe);
  const items = new Items(text.slice(range.start, probe.offset), range);
  keywords(items, expected);
  const st = statementBefore(tokens, range.start);
  const head = st[0];
  const axis = head === T.XAxis || head === T.YAxis;
  const arrowAt =
    expected.has(T.AxisTextDelimiter) ||
    (axis && expected.has(T.Minus) && /^-+$/.test(items.prefix) && st.length > 1);
  if (arrowAt && !st.includes(T.AxisTextDelimiter) && !arrowAfter(text, tokens, probe.offset)) {
    items.add('-->', 'operator', { documentation: quadrantDocs[T.AxisTextDelimiter] ?? '' });
  }
  if (expected.has(T.PointStart) && items.prefix === '') accSeparators(items, text, range.start);
  if (!expected.has(T.Alpha) && !expected.has(T.ClassName)) return items.list;
  if (expected.has(T.ClassName) && text.slice(range.start - 3, range.start) === ':::') {
    classes(items, doc, range.start, 'ref');
  } else if (head === T.ClassDef) {
    const styles = classDefStyles(st);
    if (styles !== undefined) styleKeys(items, st, styles);
    else if (st.length === 2 && st[1] === T.Space) classes(items, doc, range.start, 'def');
  } else if (st.includes(T.PointEnd)) {
    styleKeys(items, st, st.lastIndexOf(T.PointEnd) + 1);
  }
  return items.list;
}
