/**
 * v12's box-drawing pass (`boxDrawingPreprocessor.ts`), which v12's treeView parser ran on its
 * text before Langium lexed it: pasted `tree(1)` output (`├──`, `└──`, `│`, and the heavy
 * `┣━━`, `┗━━`, `┃`) becomes indented lines. The lexer lexes what it writes, as v12's did
 * (pitfall 1), and maps every character back to the source.
 *
 * The rules, as v12 ran them on its text (the header line first, line breaks as LF, a `\n`
 * appended):
 *
 * - The pass runs only when a line's `trim()` is exactly `treeView-beta` and a later content
 *   line (not blank, a comment, a `title`/`accTitle`/`accDescr` line or `│`/`┃`-only) holds a
 *   box glyph. With no glyph anywhere it stops at once (Pele's early exit).
 * - Tabs count four columns. The segment width is the column of the first branch glyph
 *   (`├└┣┗`) past column 0 in a content line, else 4.
 * - Lines up to the header, blank, comment and metadata lines pass. `│`-only lines are dropped.
 *   A line with a branch glyph becomes `'    '.repeat(round(col / width) + 1)` and what follows
 *   the glyph, its dashes and the spaces after them (tabs as four spaces, trailing blanks
 *   cut); with nothing there it is an error. A line of box glyphs and blanks is dropped; one
 *   with another box glyph passes (a root item); one starting with a blank is an error.
 *
 * Columns are v12's: an entity (`#name;`, `#123;`) before the glyph counts as long as v12's
 * placeholder for it. Every scan is linear in the text.
 */
import {
  CR,
  HASH,
  isDigit,
  isSpace,
  isWord,
  LF,
  SEMI,
  SPACE,
  TAB,
} from '@mermaid-js/core/parser-kit';

const HEADER = 'treeView-beta';
const INDENT_UNIT = 4;

/** `─━│┃└┗├┣`. */
const BOX_GLYPH = /[─━│┃└┗├┣]/g;
const isDash = (c: number) => c === 0x2500 || c === 0x2501;
const isVertical = (c: number) => c === 0x2502 || c === 0x2503;
const isBranch = (c: number) => c === 0x2514 || c === 0x2517 || c === 0x251c || c === 0x2523;
const isGlyph = (c: number) => isDash(c) || isVertical(c) || isBranch(c);
const COMMENT_LINE = /^\s*%%/;
const METADATA_LINE = /^\s*(title[\t ]|accTitle[\t ]*:|accDescr[\t ]*[:{])/;

/** A box-pass error, as v12 threw it. */
export interface BoxError {
  /** v12's message, `Line N: …` with v12's line number (line 1 is the header line). */
  message: string;
  /** That line number. */
  line: number;
  /** The line's range in the text given to {@link boxDrawing}. */
  start: number;
  end: number;
}

/** The text v12's lexer read after the pass, and where each of its characters came from. */
export interface BoxRewrite {
  /** The rewritten text, ending with the line break v12 appended. */
  text: string;
  /**
   * Per character of {@link text}: the offset (in the text given to {@link boxDrawing}) of the
   * first and of the last character it stands for. A line's new indent stands for its whole box
   * prefix, a tab's four spaces for the tab, a line break for its CRLF; the appended break is
   * at the end of the text.
   */
  first: Uint32Array;
  last: Uint32Array;
}

/** What the pass did: nothing (neither field), a rewrite, or an error. */
export interface BoxPass {
  rewrite?: BoxRewrite;
  error?: BoxError;
}

/** A line of the text: `[start, end)`, its line break `[end, next)`. */
interface Line {
  start: number;
  end: number;
  next: number;
}

/**
 * v12's box-drawing pass over `text[from…]` (from the header, after the leading blanks v12
 * trimmed), with the `\n` v12 appended. CR, CRLF and LF are line breaks, as v12 had them all
 * as LF.
 */
export function boxDrawing(text: string, from: number): BoxPass {
  BOX_GLYPH.lastIndex = from;
  if (!BOX_GLYPH.test(text)) return {};
  const lines = splitLines(text, from);
  const at = (l: Line) => text.slice(l.start, l.end);
  const header = lines.findIndex((l) => at(l).trim() === HEADER);
  if (header < 0) return {};

  const width = segmentWidth(lines.slice(header + 1).map(at));
  if (width === 0) return {};

  const out = new Output(text.length - from);
  let previous: Line | undefined;
  const keep = (l: Line) => {
    if (previous) out.lineBreak(previous.end, previous.next);
    previous = l;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const line = at(l);
    if (i <= header || passes(line)) {
      keep(l);
      out.copy(l.start, l.end, text);
      continue;
    }
    if (decoration(line)) continue;
    const branch = branchColumn(line);
    if (branch) {
      const content = branchContent(line, branch.index, l.start);
      if (!content) {
        return {
          error: {
            message: `Line ${i + 1}: Empty node — expected a filename or directory name after the box-drawing prefix`,
            line: i + 1,
            start: l.start,
            end: l.end,
          },
        };
      }
      keep(l);
      const depth = Math.round(branch.col / width) + 1;
      out.indent(INDENT_UNIT * depth, l.start, (content.map[0] ?? l.start + 1) - 1);
      out.mapped(content.text, content.map);
      continue;
    }
    let glyphsOnly = true;
    let glyph = false;
    for (let j = 0; j < line.length; j++) {
      const c = line.charCodeAt(j);
      if (isGlyph(c)) glyph = true;
      else if (!isSpace(c)) glyphsOnly = false;
    }
    if (glyphsOnly) continue;
    if (!glyph && isSpace(line.charCodeAt(0))) {
      return {
        error: {
          message:
            `Line ${i + 1}: Unexpected indentation without box-drawing characters. ` +
            'In box-drawing format, use ├── or └── prefixes for indented nodes.',
          line: i + 1,
          start: l.start,
          end: l.end,
        },
      };
    }
    keep(l);
    out.copy(l.start, l.end, text);
  }
  return { rewrite: out.finish() };
}

/**
 * The segment width of a box-drawing text whose content lines (after the header) are `lines`:
 * the column of the first branch glyph past column 0, else 4; 0 when no content line holds a
 * box glyph (no box drawing).
 */
function segmentWidth(lines: readonly string[]): number {
  let boxed = false;
  let width = 0;
  for (const line of lines) {
    if (passes(line) || decoration(line)) continue;
    if (!boxed) {
      for (let j = 0; j < line.length; j++) {
        if (isGlyph(line.charCodeAt(j))) {
          boxed = true;
          break;
        }
      }
    }
    if (width === 0) {
      const col = branchColumn(line)?.col ?? 0;
      if (col > 0) width = col;
    }
    if (boxed && width > 0) break;
  }
  if (!boxed) return 0;
  return width === 0 ? INDENT_UNIT : width;
}

/** The lines of `text[from…]` plus v12's appended `\n`, so the last line is always empty. */
function splitLines(text: string, from: number): Line[] {
  const n = text.length;
  const lines: Line[] = [];
  let s = from;
  for (;;) {
    let e = s;
    while (e < n) {
      const c = text.charCodeAt(e);
      if (c === LF || c === CR) break;
      e++;
    }
    if (e >= n) {
      lines.push({ start: s, end: n, next: n }, { start: n, end: n, next: n });
      return lines;
    }
    const next = text.charCodeAt(e) === CR && text.charCodeAt(e + 1) === LF ? e + 2 : e + 1;
    lines.push({ start: s, end: e, next });
    s = next;
  }
}

/** Blank, comment and metadata lines, which pass unchanged and are not content. */
function passes(line: string): boolean {
  return line.trim() === '' || COMMENT_LINE.test(line) || METADATA_LINE.test(line);
}

/** `^[\s│┃]+$`: a line of continuation glyphs and blanks (non-empty: blank lines pass first). */
function decoration(line: string): boolean {
  for (let j = 0; j < line.length; j++) {
    const c = line.charCodeAt(j);
    if (!isSpace(c) && !isVertical(c)) return false;
  }
  return line.length > 0;
}

/**
 * The line's first branch glyph: its index in the line, and its column as v12 counted it
 * (tabs as four, entity placeholders at their length).
 */
function branchColumn(line: string): { index: number; col: number } | undefined {
  let col = 0;
  for (let j = 0; j < line.length; j++) {
    const c = line.charCodeAt(j);
    if (isBranch(c)) return { index: j, col };
    if (c === TAB) {
      col += INDENT_UNIT;
      continue;
    }
    if (c === HASH) {
      // `#\w+;` became `ﬂ°name¶ß` (`ﬂ°°123¶ß` for a number) before v12's pass.
      let k = j + 1;
      let digits = true;
      while (k < line.length && isWord(line.charCodeAt(k))) {
        if (!isDigit(line.charCodeAt(k))) digits = false;
        k++;
      }
      if (k > j + 1 && line.charCodeAt(k) === SEMI) {
        col += k + 1 - j + (digits ? 3 : 2);
        j = k;
        continue;
      }
    }
    col++;
  }
  return undefined;
}

/**
 * What follows the branch glyph at `index`, its dashes and the spaces after them, with tabs
 * as four spaces and trailing blanks cut; `map[k]` is the offset of the character that
 * `text[k]` came from (`lineStart` is the line's offset). Undefined when nothing is left.
 */
function branchContent(
  line: string,
  index: number,
  lineStart: number
): { text: string; map: number[] } | undefined {
  let j = index + 1;
  while (j < line.length && isDash(line.charCodeAt(j))) j++;
  // v12 skipped spaces only, but its tabs were spaces by then.
  while (j < line.length && (line.charCodeAt(j) === SPACE || line.charCodeAt(j) === TAB)) j++;
  let e = line.length;
  // `trimEnd()`: every `\s` character.
  while (e > j && isSpace(line.charCodeAt(e - 1))) e--;
  if (e <= j) return undefined;
  let text = '';
  const map: number[] = [];
  for (let k = j; k < e; k++) {
    if (line.charCodeAt(k) === TAB) {
      text += '    ';
      map.push(lineStart + k, lineStart + k, lineStart + k, lineStart + k);
    } else {
      text += line[k];
      map.push(lineStart + k);
    }
  }
  return { text, map };
}

/** The rewritten text and its two offset arrays, grown as needed. */
class Output {
  private readonly parts: string[] = [];
  private n = 0;
  private first: Uint32Array;
  private last: Uint32Array;

  constructor(capacity: number) {
    const size = Math.max(16, capacity + (capacity >> 1));
    this.first = new Uint32Array(size);
    this.last = new Uint32Array(size);
  }

  /** `text[start, end)` as it is. */
  copy(start: number, end: number, text: string): void {
    this.reserve(end - start);
    for (let i = start; i < end; i++) this.put(i, i);
    this.parts.push(text.slice(start, end));
  }

  /** `count` spaces standing for the source `[first, last]` (a box prefix). */
  indent(count: number, first: number, last: number): void {
    this.reserve(count);
    for (let k = 0; k < count; k++) this.put(first, last);
    this.parts.push(' '.repeat(count));
  }

  /** `text`, character `k` standing for the source offset `map[k]`. */
  mapped(text: string, map: readonly number[]): void {
    this.reserve(text.length);
    for (const m of map) this.put(m, m);
    this.parts.push(text);
  }

  /** `\n` standing for the source line break `[end, next)`. */
  lineBreak(end: number, next: number): void {
    this.reserve(1);
    this.put(end, Math.max(end, next - 1));
    this.parts.push('\n');
  }

  finish(): BoxRewrite {
    return {
      text: this.parts.join(''),
      first: this.first.slice(0, this.n),
      last: this.last.slice(0, this.n),
    };
  }

  private put(first: number, last: number): void {
    this.first[this.n] = first;
    this.last[this.n] = last;
    this.n++;
  }

  private reserve(more: number): void {
    if (this.n + more <= this.first.length) return;
    const size = Math.max(this.first.length * 2, this.n + more);
    const first = new Uint32Array(size);
    first.set(this.first.subarray(0, this.n));
    this.first = first;
    const last = new Uint32Array(size);
    last.set(this.last.subarray(0, this.n));
    this.last = last;
  }
}
