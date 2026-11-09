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
import { isSpace, lineEnd, newlineAt, SPACE, TAB } from '@mermaid-js/core/parser-kit';
import { entityAt, grow, numericEntity } from './text.ts';
import { HEADER } from './tokens.ts';

/** Columns a tab counts, and the spaces v12 wrote for it. */
const TAB_WIDTH = 4;
/** Spaces of indent v12 wrote per depth. */
const INDENT_UNIT = 4;
/** The segment width when no branch glyph sits past column 0. */
const DEFAULT_WIDTH = 4;
/** How much longer v12's placeholder was than the entity: `ﬂ°…¶ß`, `ﬂ°°…¶ß` for a number. */
const PLACEHOLDER_EXTRA = 2;
const NUMERIC_PLACEHOLDER_EXTRA = 3;

const isDash = (c: number) => c === 0x2500 || c === 0x2501;
const isVertical = (c: number) => c === 0x2502 || c === 0x2503;
const isBranch = (c: number) => c === 0x2514 || c === 0x2517 || c === 0x251c || c === 0x2523;
/** `[─━│┃└┗├┣]`. */
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

/**
 * What the pass did: nothing, a rewrite, or an error (v12 threw at `error`; nothing was
 * rewritten). `errors` are every line v12's rules reject, `error` first: v12 stopped at the
 * first, the parser reports each (R-PARSE-4).
 */
export type BoxPass =
  | { kind: 'none' }
  | { kind: 'rewrite'; rewrite: BoxRewrite }
  | { kind: 'error'; error: BoxError; errors: readonly BoxError[] };

const NONE: BoxPass = { kind: 'none' };

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
  let glyph = from;
  while (glyph < text.length && !isGlyph(text.charCodeAt(glyph))) glyph++;
  if (glyph >= text.length) return NONE;
  const lines = splitLines(text, from);
  const at = (l: Line) => text.slice(l.start, l.end);
  const header = lines.findIndex((l) => at(l).trim() === HEADER);
  if (header < 0) return NONE;
  const width = segmentWidth(lines.slice(header + 1).map(at));
  if (width === 0) return NONE;

  const out = new Output(text, text.length - from);
  let previous: Line | undefined;
  const keep = (l: Line) => {
    if (previous) out.lineBreak(previous.end, previous.next);
    previous = l;
  };
  const errors: BoxError[] = [];
  const fail = (i: number, l: Line, message: string): void => {
    errors.push({ message: `Line ${i + 1}: ${message}`, line: i + 1, start: l.start, end: l.end });
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const line = at(l);
    if (i <= header || passes(line)) {
      keep(l);
      out.copy(l.start, l.end);
      continue;
    }
    if (decoration(line)) continue;
    const branch = branchColumn(line);
    if (branch) {
      const content = branchContent(line, branch.index, l.start);
      if (!content) {
        fail(
          i,
          l,
          'Empty node — expected a filename or directory name after the box-drawing prefix'
        );
        continue;
      }
      keep(l);
      const depth = Math.round(branch.col / width) + 1;
      out.indent(INDENT_UNIT * depth, l.start, (content.map[0] ?? l.start + 1) - 1);
      out.mapped(content.text, content.map);
      continue;
    }
    const kind = glyphs(line);
    if (kind === 'only') continue;
    if (kind === 'none' && isSpace(line.charCodeAt(0))) {
      fail(
        i,
        l,
        'Unexpected indentation without box-drawing characters. ' +
          'In box-drawing format, use ├── or └── prefixes for indented nodes.'
      );
      continue;
    }
    keep(l);
    out.copy(l.start, l.end);
  }
  const [error] = errors;
  if (error) return { kind: 'error', error, errors };
  return { kind: 'rewrite', rewrite: out.finish() };
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
    if (!boxed) boxed = glyphs(line) !== 'none';
    if (width === 0) {
      const col = branchColumn(line)?.col ?? 0;
      if (col > 0) width = col;
    }
    if (boxed && width > 0) break;
  }
  if (!boxed) return 0;
  return width === 0 ? DEFAULT_WIDTH : width;
}

/** The lines of `text[from…]` plus v12's appended `\n`, so the last line is always empty. */
function splitLines(text: string, from: number): Line[] {
  const n = text.length;
  const lines: Line[] = [];
  for (let s = from; ; ) {
    const e = lineEnd(text, s);
    if (e >= n) {
      lines.push({ start: s, end: n, next: n }, { start: n, end: n, next: n });
      return lines;
    }
    const next = e + newlineAt(text, e);
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

/** Whether the line holds no box glyph, some, or only glyphs and blanks. */
function glyphs(line: string): 'none' | 'some' | 'only' {
  let only = true;
  let some = false;
  for (let j = 0; j < line.length; j++) {
    const c = line.charCodeAt(j);
    if (isGlyph(c)) some = true;
    else if (!isSpace(c)) only = false;
  }
  if (!some) return 'none';
  return only ? 'only' : 'some';
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
      col += TAB_WIDTH;
      continue;
    }
    const end = entityAt(line, j);
    if (end > 0) {
      const extra = numericEntity(line, j, end) ? NUMERIC_PLACEHOLDER_EXTRA : PLACEHOLDER_EXTRA;
      col += end - j + extra;
      j = end - 1;
      continue;
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
      text += ' '.repeat(TAB_WIDTH);
      for (let t = 0; t < TAB_WIDTH; t++) map.push(lineStart + k);
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

  constructor(
    private readonly input: string,
    capacity: number
  ) {
    const size = Math.max(16, capacity + (capacity >> 1));
    this.first = new Uint32Array(size);
    this.last = new Uint32Array(size);
  }

  /** `[start, end)` of the input, as it is. */
  copy(start: number, end: number): void {
    this.reserve(end - start);
    for (let i = start; i < end; i++) this.put(i, i);
    this.parts.push(this.input.slice(start, end));
  }

  /** `count` spaces standing for the input `[first, last]` (a box prefix). */
  indent(count: number, first: number, last: number): void {
    this.reserve(count);
    for (let k = 0; k < count; k++) this.put(first, last);
    this.parts.push(' '.repeat(count));
  }

  /** `text`, character `k` standing for the input offset `map[k]`. */
  mapped(text: string, map: readonly number[]): void {
    this.reserve(text.length);
    for (const m of map) this.put(m, m);
    this.parts.push(text);
  }

  /** `\n` standing for the input line break `[end, next)`. */
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
    [this.first, this.last] = grow(
      this.first,
      this.last,
      Math.max(this.first.length * 2, this.n + more)
    );
  }
}
