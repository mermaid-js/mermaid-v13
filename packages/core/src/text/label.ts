// cspell:words kepano kinsoku
// Label layout (DESIGN §5.3, R-TEXT-1…3, R-TEXT-8, R-TEXT-11). Turns label source into lines of
// styled runs, measured through the injected Measurer, ready to emit as <text>/<tspan>.
// Fast path, CJK pieces and soft-hyphen fitting are based on Pele's text/label.ts
// (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
import type { LabelBox, LabelBoxSpan, LabelSpan } from '../svg/writer.ts';
import type { SafeValue } from '../svg/types.ts';
import { entityAt } from './entities.ts';
import { PLACEHOLDER, type InlineSpans } from './inline.ts';
import { Style, type FontKey, type Measurer, type StyleBits } from './measurer.ts';

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
 * What a label's source may hold besides text (D560). `plain`: character references, `<br>` and
 * the `<b>`/`<i>` HTML subset. `emphasis`: plain, plus `**`, `*`, `__` and `_`. `markdown`:
 * emphasis, plus inline code, bullet items and backslash escapes.
 */
export type LabelMarkup = 'plain' | 'emphasis' | 'markdown';

export interface LabelOptions {
  /** The label's mode. Default `plain`. A markdown string (`"`…`"`) is `markdown`. */
  readonly markup?: LabelMarkup;
  /** @deprecated Use `markup: 'markdown'`. Goes when every caller has moved (D560). */
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
const RE_PLAIN_BREAK = /\\n|\r\n?|\n|<br\s*\/?>/i;
const RE_SPACES = /[ \t]+/g;
const SHY = '\u00ad';
const ZWJ = '\u200d';
const RE_HINTS = /[\u00ad\u200b]/g;

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
  const spans = options.inline?.extract(raw, font, measurer);
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

  const markdown = !!options.markdown || options.markup === 'markdown';
  // What `inline` reads: 0 plain, 1 emphasis, 2 markdown.
  const level = markdown ? 2 : +(options.markup === 'emphasis');
  if (!spans && !RE_SLOW.test(text) && !(markdown && RE_BULLET.test(text))) {
    const width = measurer.width(text, font, base);
    if (width <= maxWidth) return box([[run(text, base, width)]], [0], [width]);
  }

  const lines: Run[][] = [];
  const indents: number[] = [];
  const widths: number[] = [];
  const tags: Tags = { bold: 0, italic: 0, dropped: options.inline?.dropped };
  // `<script>` and `<style>` lose what they hold, as in v12 (D564); `inline` drops the tags.
  const shown = (markdown ? src : text).replace(RE_SCRIPT, '$1$2').replace(RE_STYLE, '$1$2');
  for (const { source, bullet } of markdown
    ? markdownLines(shown)
    : plainLines(shown, options.backslashBreak)) {
    const pieces = tidy(inline(source, base, tags, level, spans?.boxes));
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
interface SourceLine {
  source: string;
  bullet?: 0 | 1;
}

const BULLETS = ['\u2022 ', '\u25e6 '] as const;
const RE_BULLET = /^([ \t]*)[-*] +(?=\S)/;
const RE_MD_BREAK = /<br\s*\/?>|\r\n?/gi;

/** Lines of a plain or emphasis label. Without `backslashBreak` a written `\n` stays text. */
function plainLines(text: string, backslashBreak = true): SourceLine[] {
  const lines = backslashBreak
    ? text.split(RE_PLAIN_BREAK)
    : text.replace(RE_MD_BREAK, '\n').split('\n');
  return lines.map((source) => ({ source }));
}

/**
 * Markdown lines: `<br>` and newlines break, blank lines are dropped, and a line starting with
 * `- ` or `* ` is a bullet item, nested one level when indented more than the item before.
 */
function markdownLines(text: string): SourceLine[] {
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

const RE_TAG = /<(\/?)([a-zA-Z][\w-]*)(?:\s[^<>]*)?\/?>/y;
// A `<script>` or `<style>` start tag, recognised as `RE_TAG` does, with what the element holds:
// up to its end tag, which stays for `inline` to drop. With no end tag the element holds nothing
// and the rest of the label is matched as group 2, so that it is kept and scanned once.
const RE_SCRIPT = /(<script(?:\s[^<>]*)?\/?>)(?:[^]*?(?=<\/script(?:\s[^<>]*)?\/?>)|([^]*))/gi;
const RE_STYLE = /(<style(?:\s[^<>]*)?\/?>)(?:[^]*?(?=<\/style(?:\s[^<>]*)?\/?>)|([^]*))/gi;
const BOLD_TAGS = new Set(['b', 'strong']);
const ITALIC_TAGS = new Set(['i', 'em']);
// HTML elements whose tags are dropped, text kept (R-TEXT-3), and reported as `HTML_DROPPED`
// unless they are bold or italic (D564). Anything else shaped like a tag, such as the type in
// List<T>, is text.
const HTML_TAGS = new Set(
  (
    'a abbr address article aside audio b bdi bdo big blockquote body br button caption center cite code col ' +
    'colgroup data dd del details dfn dialog div dl dt em embed fieldset figcaption figure font footer form h1 h2 ' +
    'h3 h4 h5 h6 head header hr html i iframe img input ins kbd label legend li link main map mark meta meter nav ' +
    'noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script section select ' +
    'small source span strike strong style sub summary sup table tbody td template textarea tfoot th thead time ' +
    'title tr track tt u ul var video wbr'
  ).split(' ')
);

/** Open `<b>`/`<strong>` and `<i>`/`<em>` tags. HTML tags stay open across line breaks. */
interface Tags {
  bold: number;
  italic: number;
  /** Where the names of the other tags go: the render's `InlineSpans.dropped`. */
  dropped: Set<string> | undefined;
}

const RE_ESCAPABLE = /[!-/:-@[-`{-~]/;
const RE_WORD = /\w/;

/**
 * Splits one line of source into styled pieces: HTML subset tags and character references, from
 * `level` 1 (`emphasis`) emphasis, and at 2 (`markdown`) inline code and backslash escapes.
 * Emphasis stays in its line.
 */
function inline(
  source: string,
  base: StyleBits,
  tags: Tags,
  level: number,
  boxes?: readonly LabelBoxSpan[]
): Piece[] {
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
    const next =
      base | marked | (tags.bold > 0 ? Style.Bold : 0) | (tags.italic > 0 ? Style.Italic : 0);
    if (next === style) return;
    if (text !== '') out.push({ text, style });
    text = '';
    style = next;
  };
  restyle();
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
      RE_TAG.lastIndex = i;
      const m = RE_TAG.exec(source);
      const tag = m?.[2]?.toLowerCase();
      if (m && tag !== undefined && HTML_TAGS.has(tag)) {
        const step = m[1] === '/' ? -1 : 1;
        if (BOLD_TAGS.has(tag)) tags.bold = Math.max(0, tags.bold + step);
        else if (ITALIC_TAGS.has(tag)) tags.italic = Math.max(0, tags.italic + step);
        else tags.dropped?.add(tag);
        restyle();
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
    } else if (level > 1 && ch === '\\' && RE_ESCAPABLE.test(source[i + 1] ?? '')) {
      text += source[i + 1];
      i += 2;
      continue;
    } else if (level > 1 && ch === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) {
        if (text !== '') out.push({ text, style });
        pushSource(source.slice(i + 1, end), style | Style.Mono);
        text = '';
        i = end + 1;
        continue;
      }
    } else if (level && (ch === '*' || ch === '_')) {
      const double = source[i + 1] === ch;
      const bit = double ? Style.Bold : Style.Italic;
      const len = double ? 2 : 1;
      const prev = source[i - 1] ?? ' ';
      const next = source[i + len] ?? ' ';
      const opening = (marked & bit) === 0;
      const can = opening
        ? next.trim() !== '' && source.includes(double ? ch + ch : ch, i + len + 1)
        : prev.trim() !== '';
      const intraWord = ch === '_' && RE_WORD.test(prev) && RE_WORD.test(next);
      if (can && !intraWord) {
        marked = opening ? marked | bit : marked & ~bit;
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

/** Splits pieces after each hyphen that is a break opportunity, in one scan of the text. */
function hyphenBreaks(parts: string[]): string[] {
  let out: string[] | undefined;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as string;
    let from = 0;
    for (let at = part.indexOf('-', 1); at !== -1; at = part.indexOf('-', at + 1)) {
      if (
        RE_BEFORE_HYPHEN.test(part[at - 1] as string) &&
        RE_AFTER_HYPHEN.test(part[at + 1] ?? '')
      ) {
        out ??= parts.slice(0, i);
        out.push(part.slice(from, at + 1));
        from = at + 1;
      }
    }
    if (out) out.push(from === 0 ? part : part.slice(from));
  }
  return out ?? parts;
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
          .replace(RE_HINTS, '');
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

/** Merges same-style pieces, trims the line ends, resolves break hints and measures the runs. */
function finish(line: Piece[], broken: boolean, font: FontKey, measurer: Measurer): Run[] {
  const merged: Piece[] = [];
  for (const piece of line) {
    const last = merged[merged.length - 1];
    if (last && !last.box && !piece.box && last.style === piece.style) last.text += piece.text;
    else merged.push({ ...piece });
  }
  const first = merged[0];
  if (first && !first.box) first.text = first.text.trimStart();
  const last = merged[merged.length - 1];
  if (last && !last.box) {
    last.text = last.text.trimEnd();
    // A soft hyphen at a line break shows as '-'.
    if (broken && last.text.endsWith(SHY)) last.text = last.text.slice(0, -1) + '-';
  }
  const runs: Run[] = [];
  for (const piece of merged) {
    if (piece.box) {
      runs.push({ ...piece.box, style: piece.style } satisfies BoxRun);
      continue;
    }
    const text = piece.text.replace(RE_HINTS, '');
    if (text === '') continue;
    runs.push(run(text, piece.style, measurer.width(text, font, piece.style)));
  }
  return runs;
}

// Inline code is drawn in the generic monospace family, which the table measures at 0.6 em.
const MONO = 'monospace' as SafeValue;

function run(text: string, style: StyleBits, width: number): Run {
  if (style === 0) return { text, style, width };
  return {
    text,
    style,
    width,
    ...(style & Style.Bold ? { bold: true } : {}),
    ...(style & Style.Italic ? { italic: true } : {}),
    ...(style & Style.Underline ? { underline: true } : {}),
    ...(style & Style.Mono ? { attrs: { 'font-family': MONO } } : {}),
  };
}
