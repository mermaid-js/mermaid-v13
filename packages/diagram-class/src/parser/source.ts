/**
 * What v12 did to class-diagram text before its lexer saw it, reproduced without rewriting the
 * source (DESIGN §4.1). v12 ran these rewrites, in order (`preprocessDiagram`, then
 * `Diagram.fromText`):
 *
 * 1. `cleanupText`: CRLF and CR → LF, and `="x"` → `='x'` inside every `<tag …>`;
 * 2. directives removed; then, on that text, every line comment (`^\s*%%(?!{)[^\n]+\n?`,
 *    multiline) removed and leading whitespace trimmed;
 * 3. `encodeEntities`: `style.*:\S*#.*;` loses its last `;`, then `classDef.*:\S*#.*;` does;
 *    then every `#name;` / `#123;` becomes an entity placeholder;
 * 4. a `\n` is appended.
 *
 * v13 keeps the source as written. {@link v12Text} runs those steps, in order and each on the
 * output of the one before, over a copy that records the source range of every character, so
 * the lexer can run jison's rules on exactly v12's text and still report source offsets. Every
 * step is a linear scan (no regex on user input, R-PARSE-7).
 */
import {
  COLON,
  CR,
  DQUOTE,
  EQUALS,
  HASH,
  isDigit,
  isSpace,
  isWord,
  LBRACE,
  LF,
  PERCENT,
  SEMI,
} from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';

/** A span v12 removed before lexing that v13 writes as a trivia token. */
export interface Hole extends Range {
  kind: 'comment' | 'directive';
}

/** The text v12's class lexer saw, and where each of its characters came from. */
export interface V12Text {
  /** v12's text, including the `\n` it appended (whose source range is empty, at the end). */
  text: string;
  /** Length of {@link text} without the appended `\n`. */
  length: number;
  /** Source offset where `text[i]` starts, or undefined when it is `from + i` throughout. */
  starts: Uint32Array | undefined;
  /** Source offset where `text[i]` ends; undefined with {@link starts}. */
  ends: Uint32Array | undefined;
  /** The source offset of `text[0]` when {@link starts} is undefined. */
  from: number;
  /** Comments and directives v12 removed, in source order (trivia). */
  holes: Hole[];
}

const PLACEHOLDER_OPEN = 'ﬂ°';
const PLACEHOLDER_CLOSE = '¶ß';
const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;
/** What a regex `.` does not match (once CR is gone), and what multiline `^` follows. */
const isLineEnd = (c: number) => c === LF || c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR;

/** Characters with their source ranges. */
interface Chars {
  text: string;
  starts: Uint32Array;
  ends: Uint32Array;
}

/** Characters with their source ranges, appended in order. */
class Builder {
  private readonly parts: string[] = [];
  private starts: Uint32Array;
  private ends: Uint32Array;
  private n = 0;

  constructor(capacity: number) {
    this.starts = new Uint32Array(capacity + 1);
    this.ends = new Uint32Array(capacity + 1);
  }

  push(ch: string, start: number, end: number): void {
    if (this.n === this.starts.length) this.grow();
    this.parts.push(ch);
    this.starts[this.n] = start;
    this.ends[this.n] = end;
    this.n++;
  }

  /** Copy `c[i]`. */
  keep(c: Chars, i: number): void {
    this.push(c.text[i] ?? '', c.starts[i] ?? 0, c.ends[i] ?? 0);
  }

  done(): Chars {
    return {
      text: this.parts.join(''),
      starts: this.starts.subarray(0, this.n),
      ends: this.ends.subarray(0, this.n),
    };
  }

  private grow(): void {
    const starts = new Uint32Array(this.starts.length * 2);
    starts.set(this.starts);
    this.starts = starts;
    const ends = new Uint32Array(this.ends.length * 2);
    ends.set(this.ends);
    this.ends = ends;
  }
}

/** v12's text for the body `src[from…]`, given the directive ranges core's preprocess found. */
export function v12Text(src: string, from: number, directives: readonly Range[]): V12Text {
  const dirs = directives.filter((d) => d.start >= from);
  if (
    dirs.length === 0 &&
    !src.includes('%%', from) &&
    !src.includes('\r', from) &&
    !src.includes('<', from) &&
    !src.includes(';', from) &&
    !isSpace(src.charCodeAt(from))
  ) {
    const text = src.slice(from) + '\n';
    return { text, length: text.length - 1, starts: undefined, ends: undefined, from, holes: [] };
  }
  const cleaned = withoutDirectives(src, from, dirs);
  const comments: Hole[] = [];
  const body = trimStart(withoutComments(cleaned, comments));
  const dropped = dropSemicolon(dropSemicolon(body, 'style'), 'classDef');
  const out = withEntities(dropped);
  return {
    text: out.text + '\n',
    length: out.text.length,
    starts: appendEnd(out.starts, src.length),
    ends: appendEnd(out.ends, src.length),
    from: 0,
    holes: trivia(comments, dirs),
  };
}

function appendEnd(a: Uint32Array, at: number): Uint32Array {
  const b = new Uint32Array(a.length + 1);
  b.set(a);
  b[a.length] = at;
  return b;
}

/** Step 1 and the first half of step 2: line breaks and tag quotes converted, directives cut. */
function withoutDirectives(src: string, from: number, dirs: readonly Range[]): Chars {
  const quotes = tagQuotes(src, from);
  const b = new Builder(src.length - from);
  let d = 0;
  for (let i = from; i < src.length; ) {
    const r = dirs[d];
    if (r && r.start <= i) {
      i = Math.max(i, r.end);
      d++;
      continue;
    }
    const c = src.charCodeAt(i);
    if (c === CR) {
      const end = src.charCodeAt(i + 1) === LF ? i + 2 : i + 1;
      b.push('\n', i, end);
      i = end;
      continue;
    }
    b.push(quotes?.has(i) ? "'" : (src[i] ?? ''), i, i + 1);
    i++;
  }
  return b.done();
}

/** Offsets of the `"` that `cleanupText` turned into `'`, or undefined when none. */
function tagQuotes(src: string, from: number): Set<number> | undefined {
  let set: Set<number> | undefined;
  markTagQuotes(src, from, (i) => (set ??= new Set()).add(i));
  return set;
}

function markTagQuotes(src: string, from: number, mark: (i: number) => void): void {
  let gt = -1;
  let i = src.indexOf('<', from);
  while (i !== -1 && i + 1 < src.length) {
    if (!isWord(src.charCodeAt(i + 1))) {
      i = src.indexOf('<', i + 1);
      continue;
    }
    if (gt < i) gt = src.indexOf('>', i);
    if (gt === -1) return;
    let j = i + 1;
    while (j < gt) {
      if (src.charCodeAt(j) === EQUALS && src.charCodeAt(j + 1) === DQUOTE) {
        let close = j + 2;
        while (close < gt && src.charCodeAt(close) !== DQUOTE) close++;
        if (close >= gt) break;
        mark(j + 1);
        mark(close);
        j = close + 1;
      } else j++;
    }
    i = src.indexOf('<', gt + 1);
  }
}

/**
 * `^\s*%%(?!{)[^\n]+\n?` (global, multiline) removed from `c`; each removed span's source
 * range is added to `out`. A failed try at a line start fails from every line start up to
 * the first non-blank, so the scan resumes after that line.
 */
function withoutComments(c: Chars, out: Hole[]): Chars {
  const t = c.text;
  if (!t.includes('%%')) return c;
  const b = new Builder(t.length);
  let ls = 0;
  let kept = 0;
  const keepTo = (to: number) => {
    for (let i = kept; i < to; i++) b.keep(c, i);
  };
  while (ls < t.length) {
    let q = ls;
    while (q < t.length && isSpace(t.charCodeAt(q))) q++;
    const third = t.charCodeAt(q + 2);
    if (
      t.charCodeAt(q) === PERCENT &&
      t.charCodeAt(q + 1) === PERCENT &&
      q + 2 < t.length &&
      third !== LBRACE &&
      third !== LF
    ) {
      let e = t.indexOf('\n', q + 2);
      e = e < 0 ? t.length : e + 1;
      keepTo(ls);
      out.push({ start: c.starts[ls] ?? 0, end: c.ends[e - 1] ?? 0, kind: 'comment' });
      kept = ls = e;
      continue;
    }
    let e = q;
    while (e < t.length && !isLineEnd(t.charCodeAt(e))) e++;
    ls = e + 1;
  }
  keepTo(t.length);
  return b.done();
}

/** `trimStart()`. */
function trimStart(c: Chars): Chars {
  let i = 0;
  while (i < c.text.length && isSpace(c.text.charCodeAt(i))) i++;
  if (i === 0) return c;
  return { text: c.text.slice(i), starts: c.starts.subarray(i), ends: c.ends.subarray(i) };
}

/**
 * `word.*:\S*#.*;` (global; `.` stops at line ends) with the last character of each match cut:
 * on a line with `word`, then a `:` and a `#` with no blank between them, the line's last `;`
 * after that `#`. A later `word` on the line cannot match where the first did not.
 */
function dropSemicolon(c: Chars, word: string): Chars {
  const t = c.text;
  if (!t.includes(word) || !t.includes(';')) return c;
  const drops: number[] = [];
  let next = t.indexOf(word);
  for (let ls = 0; next !== -1 && ls < t.length; ) {
    let le = ls;
    while (le < t.length && !isLineEnd(t.charCodeAt(le))) le++;
    if (next < ls) next = t.indexOf(word, ls);
    if (next !== -1 && next < le) {
      const hash = hashAfterColon(t, next + word.length, le);
      const semi = hash < 0 ? -1 : t.lastIndexOf(';', le - 1);
      if (semi > hash) drops.push(semi);
    }
    ls = le + 1;
  }
  if (drops.length === 0) return c;
  const b = new Builder(t.length);
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    if (drops[d] === i) d++;
    else b.keep(c, i);
  }
  return b.done();
}

/** `:\S*#` in `t[from, le)`: the offset of the first such `#`, or -1. */
function hashAfterColon(t: string, from: number, le: number): number {
  let colon = false;
  for (let j = from; j < le; j++) {
    const ch = t.charCodeAt(j);
    if (ch === COLON) colon = true;
    else if (ch === HASH && colon) return j;
    else if (isSpace(ch)) colon = false;
  }
  return -1;
}

/** Step 3's placeholders: `#name;` → `ﬂ°name¶ß`, `#123;` → `ﬂ°°123¶ß`. */
function withEntities(c: Chars): Chars {
  const t = c.text;
  if (!t.includes('#')) return c;
  const b = new Builder(t.length + 8);
  for (let i = 0; i < t.length; i++) {
    let j = i + 1;
    if (t.charCodeAt(i) === HASH) while (j < t.length && isWord(t.charCodeAt(j))) j++;
    if (t.charCodeAt(i) !== HASH || j === i + 1 || t.charCodeAt(j) !== SEMI) {
      b.keep(c, i);
      continue;
    }
    let digits = true;
    for (let k = i + 1; k < j; k++) digits &&= isDigit(t.charCodeAt(k));
    const open = digits ? PLACEHOLDER_OPEN + '°' : PLACEHOLDER_OPEN;
    for (const o of open) b.push(o, c.starts[i] ?? 0, c.ends[i] ?? 0);
    for (let k = i + 1; k < j; k++) b.keep(c, k);
    for (const o of PLACEHOLDER_CLOSE) b.push(o, c.starts[j] ?? 0, c.ends[j] ?? 0);
    i = j;
  }
  return b.done();
}

/** Comments and directives in source order; a directive inside a comment's range is part of it. */
function trivia(comments: readonly Hole[], dirs: readonly Range[]): Hole[] {
  const out: Hole[] = [];
  let k = 0;
  for (const r of dirs) {
    while (k < comments.length && (comments[k]?.start ?? 0) < r.start)
      out.push(comments[k++] as Hole);
    const last = out[out.length - 1];
    if (last && last.kind === 'comment' && r.end <= last.end) continue;
    out.push({ start: r.start, end: r.end, kind: 'directive' });
  }
  while (k < comments.length) out.push(comments[k++] as Hole);
  return out;
}
