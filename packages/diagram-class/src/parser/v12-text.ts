/**
 * The text v12's class lexer saw, from the shared v12 source view (D114, `sourceView` in the
 * parser kit): comments and directives cut, tag quotes converted, dropped `;` cut. Class lexes
 * that text with jison's rules as they are, so three more of v12's steps are applied here, on
 * a copy that keeps every character's source range: CR and CRLF read as LF, leading blanks
 * trimmed (`cleanupComments`), and `#name;` / `#123;` replaced by v12's entity placeholders
 * (`encodeEntities`; jison's `LABEL` rule, `[^:\n;]+`, runs on over the placeholder where it
 * would stop at the `;`). Then the `\n` v12 appended. Every step is a linear scan (R-PARSE-7).
 */
import {
  CR,
  HASH,
  isDigit,
  isSpace,
  isWord,
  LF,
  localOffset,
  QUOTE,
  SEMI,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Range } from '@mermaid-js/core/parser-kit';

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
  const view = sourceView(src, from, directives);
  const holes = view.holes.filter((h) => h.kind !== 'drop' && h.start >= from);
  if (
    view.holes.length === 0 &&
    view.mask === undefined &&
    !src.includes('\r', from) &&
    !src.includes('#', from) &&
    !isSpace(src.charCodeAt(from))
  ) {
    const text = src.slice(from) + '\n';
    return { text, length: text.length - 1, starts: undefined, ends: undefined, from, holes };
  }
  const { text, mask } = view;
  const offsets = view.runs ? new SourceOffsets(view.runs) : undefined;
  const at = (i: number) => (offsets ? offsets.source(i) : i);
  const b = new Builder(text.length);
  let i = localOffset(view, from);
  // `trimStart()`, then each character with its source range.
  while (i < text.length && isSpace(text.charCodeAt(i))) i++;
  while (i < text.length) {
    const s = at(i);
    const c = text.charCodeAt(i);
    if (c === CR) {
      const crlf = text.charCodeAt(i + 1) === LF && at(i + 1) === s + 1;
      b.push('\n', s, crlf ? s + 2 : s + 1);
      i += crlf ? 2 : 1;
      continue;
    }
    b.push(((mask?.[s] ?? 0) & QUOTE) !== 0 ? "'" : (text[i] ?? ''), s, s + 1);
    i++;
  }
  const out = withEntities(b.done());
  return {
    text: out.text + '\n',
    length: out.text.length,
    starts: appendEnd(out.starts, src.length),
    ends: appendEnd(out.ends, src.length),
    from: 0,
    holes,
  };
}

function appendEnd(a: Uint32Array, end: number): Uint32Array {
  const c = new Uint32Array(a.length + 1);
  c.set(a);
  c[a.length] = end;
  return c;
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
