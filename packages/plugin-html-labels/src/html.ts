/**
 * Label source to HTML (D697): what v12 handed the browser with `htmlLabels: true`. The tags the
 * plugin allows stay as written for the sanitizer to check; any other text shaped like a tag
 * (`List<T>`) is escaped, so it is shown and not lost. In the `emphasis` and `markdown` modes the
 * marks core reads (D562) become elements, found by core's own rules (`emphasisAt`,
 * `markdownLines`), so a label reads the same with and without the plugin. Nothing here touches
 * the DOM, and the result is not safe to insert: `sanitize.ts` makes it so.
 */
import {
  emphasisAt,
  markdownLines,
  Style,
  type LabelMarkup,
  type StyleBits,
} from '@mermaid-js/core/text';

/** The HTML elements a label may hold. The sanitizer allows exactly these. */
export const ALLOWED_TAGS: readonly string[] = (
  'a abbr b big blockquote br caption center cite code col colgroup dd del div dl dt em ' +
  'figcaption figure font h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q s samp small ' +
  'span strike strong sub sup table tbody td tfoot th thead tr tt u ul'
).split(' ');

const ALLOWED = new Set(ALLOWED_TAGS);
// The sanitizer drops these with what they hold, as v12 and core (D566) do.
const DROPPED = new Set(['script', 'style']);

const RE_TAG = /<\/?([a-zA-Z][\w-]*)(?:\s[^<>]*)?\/?>/y;
const RE_BREAK = /<br\s*\/?>|\r\n?/gi;
const RE_PLAIN_BREAK = /\\n|\n/;
const RE_ESCAPABLE = /[!-/:-@[-`{-~]/;

const escape = (text: string): string =>
  text.replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'));

/** A piece of a line as HTML, and how many characters of source it stands for. */
type Piece = readonly [html: string, length: number];

/** The tag at `i`, when it is one the sanitizer gets to see. */
function tagAt(source: string, i: number): Piece | undefined {
  RE_TAG.lastIndex = i;
  const m = RE_TAG.exec(source);
  const name = m?.[1]?.toLowerCase();
  return m && name !== undefined && (ALLOWED.has(name) || DROPPED.has(name))
    ? [m[0], m[0].length]
    : undefined;
}

/** A backslash escape or an inline code span at `i`, which only markdown has. */
function markdownAt(source: string, i: number): Piece | undefined {
  const ch = source[i];
  const next = source[i + 1] ?? '';
  if (ch === '\\' && RE_ESCAPABLE.test(next)) return [escape(next), 2];
  const end = ch === '`' ? source.indexOf('`', i + 1) : -1;
  return end > i + 1
    ? [`<code>${escape(source.slice(i + 1, end))}</code>`, end + 1 - i]
    : undefined;
}

/** The emphasis open in a line, outermost first. */
type Marks = ('strong' | 'em')[];

/** `marks` as the style bits core's `emphasisAt` reads. */
const bitsOf = (marks: Marks): StyleBits =>
  (marks.includes('strong') ? Style.Bold : 0) | (marks.includes('em') ? Style.Italic : 0);

/**
 * Opens `name`, or closes it when it is open. Elements nest, so closing one that is not the
 * innermost closes those inside it first and opens them again after.
 */
function toggle(marks: Marks, name: 'strong' | 'em'): string {
  const at = marks.indexOf(name);
  if (at < 0) {
    marks.push(name);
    return `<${name}>`;
  }
  const inner = marks.splice(at).slice(1);
  marks.push(...inner);
  const close = [...inner].reverse().map((n) => `</${n}>`);
  return `${close.join('')}</${name}>${inner.map((n) => `<${n}>`).join('')}`;
}

/** An emphasis mark at `i` that opens or closes emphasis, as core reads it. */
function markAt(source: string, i: number, marks: Marks): Piece | undefined {
  const ch = source[i] as string;
  const length = ch === '*' || ch === '_' ? emphasisAt(source, i, ch, bitsOf(marks)) : 0;
  return length > 0 ? [toggle(marks, length === 2 ? 'strong' : 'em'), length] : undefined;
}

/** What starts at `i`: a tag, markdown, an emphasis mark, or one character of text. */
function pieceAt(source: string, i: number, markup: LabelMarkup, marks: Marks): Piece {
  return (
    (source[i] === '<' ? tagAt(source, i) : undefined) ??
    (markup === 'markdown' ? markdownAt(source, i) : undefined) ??
    (markup === 'plain' ? undefined : markAt(source, i, marks)) ?? [escape(source[i] as string), 1]
  );
}

/** Closes what `marks` still has open; an element that would be empty is taken back instead. */
function closeAll(html: string, marks: Marks): string {
  let out = html;
  for (let name = marks.pop(); name !== undefined; name = marks.pop())
    out = out.endsWith(`<${name}>`) ? out.slice(0, -name.length - 2) : `${out}</${name}>`;
  return out;
}

/** One line of source as HTML. Emphasis stays in its line, as in core. */
function inline(line: string, markup: LabelMarkup): string {
  const source = line.trim();
  const marks: Marks = [];
  let out = '';
  for (let i = 0; i < source.length; ) {
    const [html, length] = pieceAt(source, i, markup, marks);
    out += html;
    i += length;
  }
  // A mark left open is closed, so the next line starts plain.
  return closeAll(out, marks);
}

/** Markdown lines as HTML: text lines broken by `<br>`, bullet items as nested lists. */
function markdownHtml(text: string): string {
  let out = '';
  // How many lists are open: 0, 1 (top level) or 2 (nested).
  let depth = 0;
  let textBefore = false;
  for (const { source, bullet } of markdownLines(text)) {
    const want = bullet === undefined ? 0 : bullet + 1;
    for (; depth > want; depth--) out += '</li></ul>';
    if (want === 0) {
      out += (textBefore ? '<br>' : '') + inline(source, 'markdown');
      textBefore = true;
      continue;
    }
    textBefore = false;
    if (depth === want) out += '</li>';
    for (; depth < want; depth++) out += '<ul>';
    out += `<li>${inline(source, 'markdown')}`;
  }
  for (; depth > 0; depth--) out += '</li></ul>';
  return out;
}

/**
 * The label `raw` as HTML. In the `plain` and `emphasis` modes a line end, a `<br>` and a written
 * `\n` break the line; in `markdown`, a line end and a `<br>` do.
 */
export function labelHtml(raw: string, markup: LabelMarkup): string {
  const text = raw.trim();
  if (markup === 'markdown') return markdownHtml(text);
  return text
    .replace(RE_BREAK, '\n')
    .split(RE_PLAIN_BREAK)
    .map((line) => inline(line, markup))
    .join('<br>');
}
