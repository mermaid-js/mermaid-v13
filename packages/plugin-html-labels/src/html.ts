/**
 * Label source to HTML (D697): what v12 handed the browser with `htmlLabels: true`. The tags the
 * plugin allows stay as written for the sanitizer to check; any other text shaped like a tag
 * (`List<T>`) is escaped, so it is shown and not lost. In the `emphasis` and `markdown` modes the
 * marks core reads (D562) become elements. Nothing here touches the DOM, and the result is not
 * safe to insert: `sanitize.ts` makes it so.
 */
import type { LabelMarkup } from '@mermaid-js/core/text';

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
const RE_BULLET = /^([ \t]*)[-*] +(?=\S)/;
const RE_ESCAPABLE = /[!-/:-@[-`{-~]/;
const RE_WORD = /[\p{L}\p{N}]/u;

const escape = (text: string): string =>
  text.replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'));

/** The tag at `i`, when it is one the sanitizer gets to see. */
function tagAt(source: string, i: number): string | undefined {
  RE_TAG.lastIndex = i;
  const m = RE_TAG.exec(source);
  const name = m?.[1]?.toLowerCase();
  return m && name !== undefined && (ALLOWED.has(name) || DROPPED.has(name)) ? m[0] : undefined;
}

/** The emphasis open in a line, outermost first. */
type Marks = ('strong' | 'em')[];

/**
 * The length (1, or 2 for bold) of the mark `ch` at `i` when it opens or closes emphasis, as
 * core's label layout reads it: an opening mark needs text after it and its closing mark later
 * in the line, a closing one text before it, and `_` inside a word is text.
 */
function emphasisAt(source: string, i: number, ch: string, marks: Marks): number {
  const double = source[i + 1] === ch;
  const len = double ? 2 : 1;
  const prev = source[i - 1] ?? ' ';
  const next = source[i + len] ?? ' ';
  const opening = !marks.includes(double ? 'strong' : 'em');
  const can = opening
    ? next.trim() !== '' && source.includes(double ? ch + ch : ch, i + len + 1)
    : prev.trim() !== '';
  const intraWord = ch === '_' && RE_WORD.test(prev) && RE_WORD.test(next);
  return can && !intraWord ? len : 0;
}

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
  const markdown = markup === 'markdown';
  const emphasis = markdown || markup === 'emphasis';
  const marks: Marks = [];
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1] ?? '';
    const tag = ch === '<' ? tagAt(source, i) : undefined;
    const end = markdown && ch === '`' ? source.indexOf('`', i + 1) : -1;
    const mark = emphasis && (ch === '*' || ch === '_') ? emphasisAt(source, i, ch, marks) : 0;
    if (tag !== undefined) {
      out += tag;
      i += tag.length;
    } else if (markdown && ch === '\\' && RE_ESCAPABLE.test(next)) {
      out += escape(next);
      i += 2;
    } else if (end > i + 1) {
      out += `<code>${escape(source.slice(i + 1, end))}</code>`;
      i = end + 1;
    } else if (mark > 0) {
      out += toggle(marks, mark === 2 ? 'strong' : 'em');
      i += mark;
    } else {
      out += escape(ch);
      i++;
    }
  }
  // A mark left open is closed, so the next line starts plain.
  return closeAll(out, marks);
}

/** One markdown source line; `bullet` is the nesting level of a bullet item. */
interface Line {
  readonly source: string;
  readonly bullet?: 0 | 1;
}

/** Markdown lines as core reads them: blank lines dropped, `- ` and `* ` items, one nesting level. */
function markdownLines(text: string): Line[] {
  const source = text.replace(RE_BREAK, '\n').split('\n');
  let common = Infinity;
  for (const line of source)
    if (line.trim() !== '') common = Math.min(common, line.length - line.trimStart().length);
  const out: Line[] = [];
  let top: number | undefined;
  for (const raw of source) {
    if (raw.trim() === '') continue;
    const line = raw.slice(common);
    const m = RE_BULLET.exec(line);
    if (!m) {
      out.push({ source: line });
      continue;
    }
    const indent = (m[1] as string).length;
    const nested = top !== undefined && indent > top;
    if (!nested) top = indent;
    out.push({ source: line.slice(m[0].length), bullet: nested ? 1 : 0 });
  }
  return out;
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
