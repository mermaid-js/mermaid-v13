// cspell:words kepano kinsoku
// Label layout (DESIGN §5.3, R-TEXT-1…3, R-TEXT-8, R-TEXT-11). Turns label source into lines of
// styled runs, measured through the injected Measurer, ready to emit as <text>/<tspan>.
// Fast path, CJK pieces and soft-hyphen fitting are based on Pele's text/label.ts
// (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
import type { LabelBox, LabelBoxSpan, LabelSpan } from '../svg/writer.ts';
import type { Attrs, SafeValue } from '../svg/types.ts';
import { entityAt } from './entities.ts';
import { PLACEHOLDER, type InlineSpans, type LabelBoxes } from './inline.ts';
import { SPACE } from '../parser-kit/char-codes.ts';
import { SMALLER, Style, type FontKey, type Measurer, type StyleBits } from './measurer.ts';
import { SLICE, UNITS, unitsWidth, type SliceMeasurer, type Units } from './table.ts';

/**
 * A run of text drawn in one style, or an inline box (`kind: 'box'`, D177) whose `text` is its
 * source as written. `width` is its advance in px.
 */
export interface Run extends LabelSpan {
  readonly style: StyleBits;
  readonly width: number;
}

/** An inline box in a line: a measured box an extension drew for a delimited span. */
export type BoxRun = Run & LabelBoxSpan;

/**
 * A laid-out label: the `LabelBox` that `SvgWriter.label()` draws, with the measurements
 * layout needs.
 */
export interface MeasuredLabel extends LabelBox {
  /** Lines top to bottom; an empty line is an empty array. */
  readonly lines: Run[][];
  /** Offset of each line from the left edge of the box (bullet nesting and hanging indent). */
  readonly indents: number[];
  /** Width of each line, its indent included. */
  readonly widths: number[];
  /** The widest line. */
  readonly width: number;
  /** Set when the label has bullet items: the writer then draws it left-aligned. */
  readonly left?: boolean;
}

/**
 * What a label's source may hold besides text (D562). `plain`: character references, `<br>` and
 * the drawn HTML tags (`<b>`, `<i>`, `<u>`, `<s>`, `<sub>`, `<sup>` and their aliases, D710).
 * `emphasis`: plain, plus `**`, `*`, `__` and `_`. `markdown`: emphasis, plus inline code, bullet
 * items and backslash escapes.
 */
export type LabelMarkup = 'plain' | 'emphasis' | 'markdown';

/**
 * A label as written, read by the rule every diagram type shares (D710): a whole label in
 * backticks, with or without double quotes around them, is a markdown string, returned without
 * its wrapper in the `markdown` mode. A backtick inside the outer pair makes it no markdown
 * string, so a label of two code spans is plain. Any other label is returned as written, `plain`.
 */
export function markdownString(label: string): { text: string; markup: LabelMarkup } {
  const md = RE_MARKDOWN_STRING.exec(label.trim())?.[2];
  return md === undefined ? { text: label, markup: 'plain' } : { text: md, markup: 'markdown' };
}
const RE_MARKDOWN_STRING = /^("?)`([^`]*)`\1$/;

export interface LabelOptions {
  /** The label's mode. Default `plain`. A markdown string (`"`…`"`) is `markdown`. */
  readonly markup?: LabelMarkup;
  /** @deprecated Use `markup: 'markdown'`. Goes when every caller has moved (D562). */
  readonly markdown?: boolean;
  /**
   * Whether a backslash and an `n`, written as two characters, break the line in the `plain` and
   * `emphasis` modes. Default true. A `markdown` label never breaks there.
   */
  readonly backslashBreak?: boolean;
  /** Style bits every run starts from. Default 0. */
  readonly style?: StyleBits;
  /**
   * The render's inline-box providers (`RenderContext.inline`, D177). Without it, or with no
   * provider for a label's spans, the label is laid out as written.
   */
  readonly inline?: InlineSpans;
  /**
   * Keep a word wider than `maxWidth` whole on a line of its own, so the label is as wide as the
   * word, instead of splitting it between characters. Default false.
   */
  readonly keepWords?: boolean;
}

interface Piece {
  text: string;
  style: StyleBits;
  /** Set on an inline box's piece, whose text is one placeholder character. */
  box?: LabelBoxSpan;
}

// Anything that needs more than measuring once: markup, entities, escapes, explicit breaks,
// runs of white space and break hints.
const RE_SLOW = /[<&*_`\\\n\r\t\u00ad\u200b]| {2}/;
// White space other than the space: a plain label with any wraps on the general path.
const RE_OTHER_SPACE = /[^\S ]/;
const RE_SPACES = /[ \t]+/g;
const SHY = '\u00ad';
const ZWJ = '\u200d';
// The soft hyphen is dropped unless a line breaks at it. A zero-width space is a break hint too,
// but stays in the drawn text, as in v12 (D646).
const RE_SHY = /\u00ad/g;

// Break between any two Chinese or Japanese characters (Hangul is left out: Korean puts spaces
// between words). Kinsoku: closing punctuation sticks to the character before it and opening
// punctuation to the character after it, so neither starts or ends a line on its own.
const CJK = '\\u2e80-\\u9fff\\uf900-\\ufaff\\uff00-\\uff60';
const CLOSE =
  '、。，．：；！？）］｝」』】〕〉》〙〗ー…‥・ゝゞぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ,.:;!?)\\]}';
const OPEN = '（［｛「『【〔〈《〘〖([{';
const HINT = '\\u200b\\u00ad';
const RE_PIECE = new RegExp(
  `\\s*(?:[${OPEN}]*[${CJK}][${CLOSE}]*|[^\\s${CJK}${HINT}]+[${HINT}]*[${CLOSE}]*|[${HINT}]+)\\s*|\\s+`,
  'g'
);

/** The label's mode; the deprecated `markdown` flag wins while callers still pass it (D562). */
const markupOf = (options: LabelOptions): LabelMarkup =>
  options.markdown ? 'markdown' : (options.markup ?? 'plain');

/**
 * The label's boxes: a whole-label provider's (D695), which is asked first and whose box is then
 * the label's only span, or else those of its inline spans (D177).
 */
const boxesOf = (
  raw: string,
  font: FontKey,
  maxWidth: number,
  measurer: Measurer,
  markup: LabelMarkup,
  spans?: InlineSpans
): LabelBoxes | undefined =>
  spans?.label?.(raw, font, measurer, maxWidth, markup) ?? spans?.extract(raw, font, measurer);

/**
 * Lays out a label: splits it into lines, applies the markdown and HTML subsets, and wraps
 * greedily at `maxWidth` (pass `Infinity` to wrap only at explicit breaks).
 */
export function layoutLabel(
  raw: string,
  font: FontKey,
  maxWidth: number,
  measurer: Measurer,
  options: LabelOptions = {}
): MeasuredLabel {
  const base = options.style ?? 0;
  const { ascent, lineHeight } = measurer.metrics(font);
  const markup = markupOf(options);
  const spans = boxesOf(raw, font, maxWidth, measurer, markup, options.inline);
  const src = spans?.source ?? raw;
  let left = false;
  const box = (lines: Run[][], indents: number[], widths: number[]): MeasuredLabel => {
    let width = 0;
    for (const w of widths) if (w > width) width = w;
    const baselines = spans ? grownBaselines(lines, ascent, lineHeight) : undefined;
    return {
      lines,
      indents,
      widths,
      width,
      height: baselines ? baselines.height : lines.length * lineHeight,
      lineHeight,
      baseline: ascent,
      ...(left ? { left } : {}),
      ...(baselines ? { baselines: baselines.at } : {}),
    };
  };
  const text = src.trim();
  if (text === '') return box([], [], []);

  const plain = spans ? undefined : plainLabel(src, text, font, maxWidth, measurer, options);
  if (plain) return box(...plain);

  const markdown = markup === 'markdown';
  const lines: Run[][] = [];
  const indents: number[] = [];
  const widths: number[] = [];
  const tags: Tags = {};
  for (const { source, bullet } of markdown
    ? markdownLines(src)
    : plainLines(text, options.backslashBreak)) {
    const pieces = tidy(inline(source, base, tags, markup, spans?.boxes));
    let indent = 0;
    let hang = 0;
    if (bullet !== undefined) {
      left = true;
      // Nested bullets start where the text of a top-level item starts.
      indent = bullet === 0 ? 0 : measurer.width(BULLETS[0], font, base);
      hang = measurer.width(BULLETS[bullet], font, base);
    }
    const wrapped = wrap(pieces, font, measurer, maxWidth - indent - hang, options.keepWords);
    for (let i = 0; i < wrapped.length; i++) {
      const line = wrapped[i] as Piece[];
      if (bullet !== undefined && i === 0) line.unshift({ text: BULLETS[bullet], style: base });
      const runs = finish(line, i < wrapped.length - 1, font, measurer);
      const x = i === 0 ? indent : indent + hang;
      lines.push(runs);
      indents.push(x);
      widths.push(x + lineWidth(runs));
    }
  }
  return box(lines, indents, widths);
}

/**
 * Lays out a label without inline boxes as the general path does, or returns undefined for it:
 * a plain label, or a label not markdown whose source lines (`sourceLines`) are plain once `tidy`
 * has collapsed and trimmed their spaces. In such a line a backtick and a backslash are text, and
 * so are `*` and `_` in the `plain` mode. Each line is laid out by `wrapPlain`. A plain label that
 * fits is measured once instead; a line between breaks is not, as `wrap` adds up the widths of
 * its words and a measurer need not be additive.
 */
function plainLabel(
  src: string,
  text: string,
  font: FontKey,
  maxWidth: number,
  measurer: Measurer,
  options: LabelOptions
): [Run[][], number[], number[]] | undefined {
  const markup = options.markdown ? 'markdown' : options.markup;
  const base = options.style ?? 0;
  const slow = RE_SLOW.test(text);
  if (markup === 'markdown' && (slow || RE_BULLET.test(text))) return undefined;
  // What else `RE_SLOW` finds in a line that `inline` reads as more than text.
  const marked = markup === 'emphasis' ? /[<&*_\u00ad\u200b]/ : /[<&\u00ad\u200b]/;
  const lines: Run[][] = [];
  const indents: number[] = [];
  const widths: number[] = [];
  const push = (runs: Run[], width: number): void => {
    lines.push(runs);
    indents.push(0);
    widths.push(width);
  };
  let width: number;
  for (let line of slow ? sourceLines(text, options.backslashBreak) : [text]) {
    if (slow) {
      // As `tidy`, which leaves white space other than spaces and tabs: the line must have none.
      line = collapsed(line);
      if (RE_OTHER_SPACE.test(line) || marked.test((line = line.trim()))) return undefined;
    }
    if (line === '') push([], 0);
    else if (!slow && (width = measurer.width(line, font, base)) <= maxWidth) {
      push([run(line, base, width, font.size)], width);
    } else if (
      // A markdown label's lines come from the untrimmed source; keep that to the general path.
      (markup === 'markdown' && src !== text) ||
      // A line between breaks has none, as tested above.
      (!slow && RE_OTHER_SPACE.test(line)) ||
      !wrapPlain(line, font, maxWidth, measurer, options, (t, w) =>
        push([run(t, base, w, font.size)], w)
      )
    ) {
      return undefined;
    }
  }
  return [lines, indents, widths];
}

/** `line` with its runs of spaces and tabs collapsed: only a tab or two spaces in a row change. */
function collapsed(line: string): string {
  return line.includes('\t') || line.includes('  ') ? line.replace(RE_SPACES, ' ') : line;
}

/**
 * Baselines of lines grown around boxes taller than the font, with the label's height, or
 * undefined when every line keeps the font's height.
 */
function grownBaselines(
  lines: readonly Run[][],
  ascent: number,
  lineHeight: number
): { at: number[]; height: number } | undefined {
  const descent = lineHeight - ascent;
  const at: number[] = [];
  let y = 0;
  let grown = false;
  for (const line of lines) {
    let above = ascent;
    let below = descent;
    for (const r of line) {
      if (r.kind !== 'box') continue;
      const box = r as BoxRun;
      above = Math.max(above, box.baseline);
      below = Math.max(below, box.height - box.baseline);
    }
    if (above > ascent || below > descent) grown = true;
    at.push(y + above);
    y += above + below;
  }
  return grown ? { at, height: y } : undefined;
}

/** One source line of a label; `bullet` is the list nesting level of a bullet item. */
export interface SourceLine {
  source: string;
  bullet?: 0 | 1;
}

const BULLETS = ['\u2022 ', '\u25e6 '] as const;
const RE_BULLET = /^([ \t]*)[-*] +(?=\S)/;
const RE_MD_BREAK = /<br\s*\/?>|\r\n?/gi;
// After `RE_MD_BREAK` has made every `<br>` and line end a `\n`.
const RE_PLAIN_BREAK = /\\n|\n/i;

/** Source lines of a plain or emphasis label. Without `backslashBreak` a written `\n` stays text. */
function sourceLines(text: string, backslashBreak = true): string[] {
  return text.replace(RE_MD_BREAK, '\n').split(backslashBreak ? RE_PLAIN_BREAK : '\n');
}

/** Lines of a plain or emphasis label, as `sourceLines`. */
function plainLines(text: string, backslashBreak?: boolean): SourceLine[] {
  return sourceLines(text, backslashBreak).map((source) => ({ source }));
}

/**
 * Markdown lines: `<br>` and newlines break, blank lines are dropped, and a line starting with
 * `- ` or `* ` is a bullet item, nested one level when indented more than the item before.
 */
export function markdownLines(text: string): SourceLine[] {
  const out: SourceLine[] = [];
  let top: number | undefined;
  const source = text.replace(RE_MD_BREAK, '\n').split('\n');
  let common = Infinity;
  for (const line of source) {
    if (line.trim() !== '') common = Math.min(common, line.length - line.trimStart().length);
  }
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

// The tags that are drawn (D566, D710), with the `Style` bit each sets: Bold 1, Italic 2,
// Sub 8, Sup 16, Underline 32, Strike 64 (as numbers, which keeps core small).
const TAG_STYLE: Readonly<Record<string, StyleBits>> = {
  b: 1,
  strong: 1,
  i: 2,
  em: 2,
  sub: 8,
  sup: 16,
  u: 32,
  ins: 32,
  s: 64,
  strike: 64,
  del: 64,
};

// A tag read as a tag: one of `TAG_STYLE`, or a `<br>` that `RE_MD_BREAK` has not made a break
// (`</br>`, `<br class="x">`), which draws nothing. Any other text shaped like a tag, `<img>`,
// `<span>` and `<script>…</script>` included, is drawn as written (#1440, #1368).
const RE_TAG = new RegExp(
  `<(\\/?)(br|${Object.keys(TAG_STYLE).join('|')})(?:\\s[^<>]*)?\\/?>`,
  'iy'
);

/** How many of the drawn tags are open, per style bit. HTML tags stay open across line breaks. */
type Tags = Record<StyleBits, number>;

const RE_ESCAPABLE = /[!-/:-@[-`{-~]/;
const RE_WORD = /\w/;

/** The drawn tag that starts at `i`, or undefined. */
function tagAt(source: string, i: number): RegExpExecArray | null {
  RE_TAG.lastIndex = i;
  return RE_TAG.exec(source);
}

/**
 * The length (1, or 2 for bold) of the emphasis mark `ch` at `i` when it opens or closes
 * emphasis, given the bits `marked` already open; 0 when it is plain text.
 */
export function emphasisAt(source: string, i: number, ch: string, marked: number): number {
  const double = source[i + 1] === ch;
  const len = double ? 2 : 1;
  const prev = source[i - 1] ?? ' ';
  const next = source[i + len] ?? ' ';
  const opening = (marked & (double ? Style.Bold : Style.Italic)) === 0;
  const can = opening
    ? next.trim() !== '' && source.includes(double ? ch + ch : ch, i + len + 1)
    : prev.trim() !== '';
  const intraWord = ch === '_' && RE_WORD.test(prev) && RE_WORD.test(next);
  return can && !intraWord ? len : 0;
}

/**
 * Splits one line of source into styled pieces: HTML subset tags and character references, in
 * the `emphasis` and `markdown` modes emphasis, and in `markdown` inline code and backslash
 * escapes. Emphasis stays in its line.
 */
function inline(
  source: string,
  base: StyleBits,
  tags: Tags,
  markup: LabelMarkup | undefined,
  boxes?: readonly LabelBoxSpan[]
): Piece[] {
  const markdown = markup === 'markdown';
  const emphasis = markdown || markup === 'emphasis';
  const out: Piece[] = [];
  const boxAt = (ch: string): LabelBoxSpan | undefined => boxes?.[ch.charCodeAt(0) - PLACEHOLDER];
  // Pushes source text in one style, its box placeholders as box pieces. Only placeholders in
  // the source are boxes: a character reference is decoded into `text` and never reaches here.
  const pushSource = (src: string, s: StyleBits): void => {
    let chunk = '';
    for (const ch of src) {
      const box = boxAt(ch);
      if (box === undefined) {
        chunk += ch;
        continue;
      }
      if (chunk !== '') out.push({ text: chunk, style: s });
      out.push({ text: ch, style: s, box });
      chunk = '';
    }
    if (chunk !== '') out.push({ text: chunk, style: s });
  };
  let text = '';
  let style = base;
  let marked = 0;
  const restyle = (): void => {
    let next = base | marked;
    for (const bit in tags) if ((tags[bit] as number) > 0) next |= +bit;
    if (next === style) return;
    if (text !== '') out.push({ text, style });
    text = '';
    style = next;
  };
  restyle();
  // Counts one HTML tag: `step` is 1 for a start tag and -1 for an end tag.
  const count = (tag: string, step: number): void => {
    const bit = TAG_STYLE[tag];
    if (bit !== undefined) tags[bit] = Math.max(0, (tags[bit] ?? 0) + step);
    restyle();
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    const box = boxAt(ch);
    if (box !== undefined) {
      if (text !== '') out.push({ text, style });
      out.push({ text: ch, style, box });
      text = '';
      i++;
      continue;
    }
    if (ch === '<') {
      const m = tagAt(source, i);
      if (m) {
        count((m[2] as string).toLowerCase(), m[1] === '/' ? -1 : 1);
        i += m[0].length;
        continue;
      }
    } else if (ch === '&') {
      const entity = entityAt(source, i);
      if (entity) {
        text += entity[0];
        i += entity[1];
        continue;
      }
    } else if (markdown && ch === '\\' && RE_ESCAPABLE.test(source[i + 1] ?? '')) {
      text += source[i + 1];
      i += 2;
      continue;
    } else if (markdown && ch === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) {
        if (text !== '') out.push({ text, style });
        pushSource(source.slice(i + 1, end), style | Style.Mono);
        text = '';
        i = end + 1;
        continue;
      }
    } else if (emphasis && (ch === '*' || ch === '_')) {
      const len = emphasisAt(source, i, ch, marked);
      if (len > 0) {
        const bit = len === 2 ? Style.Bold : Style.Italic;
        marked = (marked & bit) === 0 ? marked | bit : marked & ~bit;
        restyle();
        i += len;
        continue;
      }
    }
    text += ch;
    i++;
  }
  if (text !== '') out.push({ text, style });
  return out;
}

/** Collapses white space within and across pieces and trims the line. */
function tidy(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  let space = true; // at line start, leading space is dropped
  for (const piece of pieces) {
    if (piece.box) {
      out.push(piece);
      space = false;
      continue;
    }
    let text = piece.text.replace(RE_SPACES, ' ');
    if (space) text = text.replace(/^ /, '');
    if (text === '') continue;
    space = text.endsWith(' ');
    out.push({ text, style: piece.style });
  }
  const last = out[out.length - 1];
  if (last && !last.box) last.text = last.text.replace(/ $/, '');
  return out.filter((p) => p.text !== '');
}

function lineWidth(runs: Run[]): number {
  let w = 0;
  for (const run of runs) w += run.width;
  return w;
}

// A hyphen between a letter or digit and a letter is a break opportunity (UAX #14 class HY,
// #394): 'well-known' may break after 'well-'. Not before a digit ('2020-01-15', '-1'), after a
// leading hyphen ('-flag') or inside a run of hyphens.
const RE_BEFORE_HYPHEN = /[\p{L}\p{N}]/u;
const RE_AFTER_HYPHEN = /\p{L}/u;

/**
 * The end of the first piece of `s[from, to)`, a part of `RE_PIECE`: after its first hyphen that
 * is a break opportunity, or `to`.
 */
function hyphenEnd(s: string, from: number, to: number): number {
  for (let at = from + 1; at + 1 < to; at++) {
    if (
      s[at] === '-' &&
      RE_BEFORE_HYPHEN.test(s[at - 1] as string) &&
      RE_AFTER_HYPHEN.test(s[at + 1] as string)
    ) {
      return at + 1;
    }
  }
  return to;
}

/** Splits pieces after each hyphen that is a break opportunity, in one scan of the text. */
function hyphenBreaks(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    for (let from = 0, to = 0; from < part.length; from = to) {
      out.push(part.slice(from, (to = hyphenEnd(part, from, part.length))));
    }
  }
  return out;
}

/**
 * Greedy word wrap. Returns lines of pieces whose trimmed width fits `max` where possible. A word
 * breaks at white space, CJK characters, break hints and hyphens. Each piece is measured once;
 * the white space around it and single characters come from `small`. A piece wider than `max` is
 * split between characters, or with `keep` left whole on its line.
 */
function wrap(
  pieces: Piece[],
  font: FontKey,
  measurer: Measurer,
  max: number,
  keep = false
): Piece[][] {
  const out: Piece[][] = [];
  let current: Piece[] = [];
  let width = 0;
  const measure = (text: string, style: StyleBits): number => measurer.width(text, font, style);
  const small = smallWidths(measure);
  const commit = (): void => {
    out.push(current);
    current = [];
    width = 0;
  };
  for (const piece of pieces) {
    if (piece.box) {
      // One unbreakable piece: it starts a new line when it does not fit, and is never split.
      if (width > 0 && width + piece.box.width > max) commit();
      current.push(piece);
      width += piece.box.width;
      continue;
    }
    const style = piece.style;
    const parts = hyphenBreaks(piece.text.match(RE_PIECE) ?? []);
    for (let p = 0; p < parts.length; p++) {
      let part = parts[p] as string;
      const core = part.trim();
      const leadLength = core === '' ? part.length : part.length - part.trimStart().length;
      let lead = small(part.slice(0, leadLength), style);
      const coreWidth = core === '' ? 0 : measure(core, style);
      const trail = core === '' ? 0 : small(part.slice(leadLength + core.length), style);
      let fits: boolean;
      if (part.endsWith(SHY)) {
        // A soft hyphen fits if its '-' does, or if the rest of the word does, which hides it.
        let k = p;
        while (k + 1 < parts.length && (parts[k] as string).endsWith(SHY)) k++;
        const rest = parts
          .slice(p, k + 1)
          .join('')
          .trimEnd()
          .replace(RE_SHY, '');
        fits =
          width + measure(part.slice(0, -1) + '-', style) <= max ||
          width + measure(rest, style) <= max;
      } else {
        fits = width + lead + coreWidth <= max;
      }
      if (!fits && width > 0) {
        commit();
        part = part.slice(leadLength);
        lead = 0;
      }
      if (!keep && width === 0 && lead + coreWidth > max) {
        part = split(part, style, small, max, out);
        current.push({ text: part, style });
        width += measure(part, style);
        continue;
      }
      current.push({ text: part, style });
      width += lead + coreWidth + trail;
    }
  }
  if (current.length > 0 || out.length === 0) commit();
  return out;
}

type Width = (text: string, style: StyleBits) => number;

/** Widths of short strings that repeat within a label (spaces, single characters), per style. */
function smallWidths(measure: Width): Width {
  const byStyle = new Map<StyleBits, Map<string, number>>();
  return (text, style) => {
    if (text === '') return 0;
    let widths = byStyle.get(style);
    if (!widths) byStyle.set(style, (widths = new Map<string, number>()));
    let w = widths.get(text);
    if (w === undefined) widths.set(text, (w = measure(text, style)));
    return w;
  };
}

/**
 * Splits a piece wider than the whole line at characters, pushing every full line to `out` and
 * returning the rest. Zero-width characters and the character after a ZWJ stay attached. A chunk
 * is as wide as its characters, so each character is measured once.
 */
function split(
  part: string,
  style: StyleBits,
  charWidth: Width,
  max: number,
  out: Piece[][]
): string {
  let chunk = '';
  let chunkWidth = 0;
  let prev = '';
  for (const ch of part) {
    const w = charWidth(ch, style);
    const joined = chunk === '' || prev === ZWJ || w === 0 || ch.trim() === '';
    if (!joined && chunkWidth + w > max) {
      out.push([{ text: chunk, style }]);
      chunk = '';
      chunkWidth = 0;
    }
    chunk += ch;
    chunkWidth += w;
    prev = ch;
  }
  return chunk;
}

/**
 * `wrap` and `finish` for a plain label: trimmed, one source line, words separated by single
 * spaces, no markup, break hints or other white space (`RE_SLOW`, `RE_OTHER_SPACE`). It makes the
 * same decisions with the same arithmetic in one scan by index, and slices lines from `text`.
 *
 * With a table measurer, a slice's width is its {@link SLICE} width, bit for bit what
 * `measurer.width` returns for the slice, without slicing the text. Each word's advance
 * {@link UNITS} are summed once: a line's units are its words' and the spaces' between them,
 * which add up exactly, scaled once by `unitsWidth` as the slice width scales the line's slice.
 * Any other measurer measures the same strings `wrap` and `finish` do.
 *
 * Passes each line and its width to `out`. Returns false where `wrap` would split a word after a
 * line it has started (only when the words before it measure 0), which the general path then
 * lays out.
 */
function wrapPlain(
  text: string,
  font: FontKey,
  max: number,
  measurer: Measurer,
  options: LabelOptions,
  out: (text: string, width: number) => void
): boolean {
  const style = options.style ?? 0;
  const [small, width] = plainWidths(text, font, style, measurer);
  // Without a table measurer every count of units and the size are 0, so each width below is
  // measured (`unitsWidth(...) || width(...)`, and `small` for a space). With one, measuring
  // gives the same number, and it is measured only where the units' width is 0 or NaN.
  const table = (measurer as Partial<SliceMeasurer>)[UNITS] ?? NO_UNITS;
  const size = table.size(font, style);
  const spaceUnits = table.units(' ', 0, 1, font, style);
  const space = unitsWidth(spaceUnits, size);
  // Emits text[from, to) as a line.
  const emit = (from: number, to: number): void => out(text.slice(from, to), width(from, to));
  // As in `wrap`, where a word never has white space before it here (the text is trimmed and
  // each word takes the space after it), so its `lead` is 0. The current line is
  // text[start, end), `line` wide with the space after it; it has a word where `end > start`.
  // Before its first word, `start` is where that word starts and `end`, the end of the line
  // before (0 for the first line), is at most `start`.
  // With a table measurer it has `units`, and `gap` is the units of the space after it: both 0
  // before its first word. Lines are emitted in place: a closure that read these would hold them
  // in its context, slower here.
  let line = 0;
  let start = 0;
  let end = 0;
  let units = 0;
  let gap = 0;
  let part = 0;
  let i = 0;
  while (i < text.length) {
    // `RE_PIECE` matches the word at i (not a space; a plain label has no break hints) with the
    // one space after it, if any: a CJK word can end without one. `hyphenBreaks` splits it after
    // its hyphens that are break opportunities, into pieces without a space after them.
    if (i >= part) part = pieceEnd(text, i);
    const next = hyphenEnd(text, i, part);
    // Without the space after it: `next - core` is 1 where the piece has one, else 0.
    const core = next - Number(text.charCodeAt(next - 1) === SPACE);
    const coreUnits = table.units(text, i, core, font, style);
    const coreWidth = unitsWidth(coreUnits, size) || width(i, core);
    if (!(line + coreWidth <= max) && line > 0) {
      out(text.slice(start, end), unitsWidth(units, size) || width(start, end));
      start = i;
      line = 0;
      units = 0;
      gap = 0;
    }
    if (options.keepWords || line !== 0 || !(coreWidth > max)) {
      units += gap + coreUnits;
      line += coreWidth + (next === core ? 0 : space || small(' ', style));
    } else if (end > start) {
      return false;
    } else {
      start = splitWord(text.slice(i, next), i, style, small, max, emit);
      line = width(start, next);
      units = table.units(text, start, core, font, style);
    }
    gap = (next - core) * spaceUnits;
    end = core;
    i = next;
  }
  out(text.slice(start, end), unitsWidth(units, size) || width(start, end));
  return true;
}

/** The {@link UNITS} `wrapPlain` takes for a measurer without them: none, at size 0. */
const NO_UNITS: Units = { units: () => 0, size: () => 0 };

/**
 * The widths `wrapPlain` takes of `text`: of spaces and characters (`small` in `wrap`), and of
 * text[from, to). With a table measurer they are its slice widths, without slicing the text;
 * otherwise as in `wrap` and `finish`.
 */
function plainWidths(
  text: string,
  font: FontKey,
  style: StyleBits,
  measurer: Measurer
): [small: Width, width: (from: number, to: number) => number] {
  const slice = (measurer as Partial<SliceMeasurer>)[SLICE];
  if (slice) {
    return [
      (t, s) => slice(t, 0, t.length, font, s),
      (from, to) => slice(text, from, to, font, style),
    ];
  }
  return [
    smallWidths((t, s) => measurer.width(t, font, s)),
    (from, to) => measurer.width(text.slice(from, to), font, style),
  ];
}

/** Where the `RE_PIECE` match at `at` ends. */
function pieceEnd(text: string, at: number): number {
  RE_PIECE.lastIndex = at;
  RE_PIECE.test(text);
  return RE_PIECE.lastIndex;
}

/**
 * `split`s `word`, wider than the line, and emits its full lines from `from` on. Returns where
 * the rest, which starts the next line, begins.
 */
function splitWord(
  word: string,
  from: number,
  style: StyleBits,
  small: Width,
  max: number,
  emit: (from: number, to: number) => void
): number {
  const full: Piece[][] = [];
  const rest = from + word.length - split(word, style, small, max, full).length;
  let at = from;
  for (const [chunk] of full) emit(at, (at += (chunk as Piece).text.length));
  return rest;
}

/** Copies of `line`'s pieces, with neighbours of one style merged; a box stays a piece. */
function mergePieces(line: Piece[]): Piece[] {
  const merged: Piece[] = [];
  for (const piece of line) {
    const last = merged[merged.length - 1];
    if (last && !last.box && !piece.box && last.style === piece.style) last.text += piece.text;
    else merged.push({ ...piece });
  }
  return merged;
}

/** Trims the white space at both ends of a line's `pieces`, in place; `broken` is a wrapped line. */
function trimEnds(pieces: Piece[], broken: boolean): void {
  const first = pieces[0];
  if (first && !first.box) first.text = first.text.trimStart();
  const last = pieces[pieces.length - 1];
  if (last && !last.box) {
    last.text = last.text.trimEnd();
    // A soft hyphen at a line break shows as '-'.
    if (broken && last.text.endsWith(SHY)) last.text = last.text.slice(0, -1) + '-';
  }
}

/**
 * Merges same-style pieces, trims the line ends, resolves soft hyphens and measures the runs. A
 * zero-width space is kept (D646).
 */
function finish(line: Piece[], broken: boolean, font: FontKey, measurer: Measurer): Run[] {
  const merged = mergePieces(line);
  trimEnds(merged, broken);
  const runs: Run[] = [];
  // The shift of the run before; the writer places the text after a box afresh.
  let shift = 0;
  for (const piece of merged) {
    if (piece.box) {
      runs.push({ ...piece.box, style: piece.style } satisfies BoxRun);
      shift = 0;
      continue;
    }
    const text = piece.text.replace(RE_SHY, '');
    if (text === '') continue;
    runs.push(run(text, piece.style, measurer.width(text, font, piece.style), font.size, shift));
    shift = shiftOf(piece.style);
  }
  return runs;
}

// Inline code is drawn in the generic monospace family, which the table measures at 0.6 em.
const MONO = 'monospace' as SafeValue;

/** How far a run in `style` is shifted down from the baseline, in em (D710). */
function shiftOf(style: StyleBits): number {
  if (style & Style.Sup) return -0.4;
  return style & Style.Sub ? 0.3 : 0;
}

/**
 * A run for the writer. Sub- and superscript runs are drawn at the size they are measured at and
 * shifted with `dy`; `from` is the shift of the run before in the line (in em, at font `size`), which
 * the run undoes. The line's height does not change.
 */
function run(text: string, style: StyleBits, width: number, size: number, from = 0): Run {
  const r: Writable<Run> = { text, style, width };
  const attrs: Writable<Attrs> = {};
  const shift = shiftOf(style);
  if (style & Style.Bold) r.bold = true;
  if (style & Style.Italic) r.italic = true;
  if (style & Style.Underline) r.underline = true;
  if (style & Style.Strike) r.strike = true;
  if (style & Style.Mono) attrs['font-family'] = MONO;
  if (style & (Style.Sub | Style.Sup)) attrs['font-size'] = size / SMALLER;
  if (shift !== from) attrs.dy = (shift - from) * size;
  if (style & (Style.Mono | Style.Sub | Style.Sup) || shift !== from) r.attrs = attrs;
  return r;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };
