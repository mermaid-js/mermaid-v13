/**
 * Text rewritten by regex replacements that remembers, for every character, the source range
 * it came from. Reference pipelines (dev and CI only) rewrite their input the way an older
 * implementation did and still report ranges into the original source.
 */
export interface MappedText {
  text: string;
  /** Source offset where character i starts. */
  from: number[];
  /** Source offset where character i ends. */
  to: number[];
}

export function mapped(src: string): MappedText {
  const from: number[] = [];
  const to: number[] = [];
  for (let i = 0; i < src.length; i++) {
    from.push(i);
    to.push(i + 1);
  }
  return { text: src, from, to };
}

/**
 * `text.replace(re, fn)` (re must be global). The characters a replacement shares with the
 * start and end of its match map 1:1 (all of them when the length is kept); the rest map to
 * the part of the match they replaced. Deleted text extends the character before it.
 */
export function replaceMapped(
  m: MappedText,
  re: RegExp,
  fn: (match: string, ...groups: string[]) => string
): MappedText {
  if (!re.global) throw new TypeError('replaceMapped needs a global regex');
  const out: MappedText = { text: '', from: [], to: [] };
  let last = 0;
  const parts: string[] = [];
  for (const match of m.text.matchAll(re)) {
    const at = match.index;
    const whole = match[0];
    const rep = fn(whole, ...match.slice(1));
    parts.push(m.text.slice(last, at));
    pushAll(out.from, m.from.slice(last, at));
    pushAll(out.to, m.to.slice(last, at));
    parts.push(rep);
    // Characters the replacement keeps at either end map 1:1; the rest maps to what it replaced.
    let pre = 0;
    while (pre < rep.length && pre < whole.length && rep[pre] === whole[pre]) pre++;
    if (rep.length === whole.length) pre = rep.length;
    let suf = 0;
    while (
      suf < rep.length - pre &&
      suf < whole.length - pre &&
      rep[rep.length - 1 - suf] === whole[whole.length - 1 - suf]
    )
      suf++;
    pushAll(out.from, m.from.slice(at, at + pre));
    pushAll(out.to, m.to.slice(at, at + pre));
    const midFrom = at + pre;
    const midTo = at + whole.length - suf;
    const s0 =
      midTo > midFrom ? (m.from[midFrom] ?? 0) : (m.to[midFrom - 1] ?? m.from[midFrom] ?? 0);
    const e0 = midTo > midFrom ? (m.to[midTo - 1] ?? s0) : s0;
    for (let k = pre; k < rep.length - suf; k++) {
      out.from.push(s0);
      out.to.push(e0);
    }
    // Deleted text belongs to the character before it.
    if (rep.length - suf === pre && midTo > midFrom && out.to.length > 0) {
      out.to[out.to.length - 1] = e0;
    }
    pushAll(out.from, m.from.slice(midTo, at + whole.length));
    pushAll(out.to, m.to.slice(midTo, at + whole.length));
    last = at + whole.length;
  }
  parts.push(m.text.slice(last));
  pushAll(out.from, m.from.slice(last));
  pushAll(out.to, m.to.slice(last));
  out.text = parts.join('');
  return out;
}

/** `dst.push(...src)` without the argument limit (inputs run to hundreds of thousands). */
function pushAll(dst: number[], src: readonly number[]): void {
  for (const v of src) dst.push(v);
}

/** Drop the first `n` characters. */
export function sliceMapped(m: MappedText, n: number): MappedText {
  return { text: m.text.slice(n), from: m.from.slice(n), to: m.to.slice(n) };
}

/** Append text that maps to the empty range at `at`. */
export function appendMapped(m: MappedText, extra: string, at: number): MappedText {
  return {
    text: m.text + extra,
    from: [...m.from, ...Array.from(extra, () => at)],
    to: [...m.to, ...Array.from(extra, () => at)],
  };
}

/** Source range of the lexer-input range `[start, end)`. */
export function sourceRange(
  m: MappedText,
  start: number,
  end: number
): { start: number; end: number } {
  if (end <= start) {
    const at = m.from[start] ?? m.to[start - 1] ?? 0;
    return { start: at, end: at };
  }
  return { start: m.from[start] ?? 0, end: m.to[end - 1] ?? 0 };
}
