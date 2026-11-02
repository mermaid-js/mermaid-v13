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
 * `text.replace(re, fn)` (re must be global). Replacement characters map to the whole match;
 * when the replacement keeps the match's length, character i maps to match character i.
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
    const rep = fn(whole, ...(match.slice(1) as string[]));
    parts.push(m.text.slice(last, at));
    out.from.push(...m.from.slice(last, at));
    out.to.push(...m.to.slice(last, at));
    parts.push(rep);
    if (rep.length === whole.length) {
      out.from.push(...m.from.slice(at, at + whole.length));
      out.to.push(...m.to.slice(at, at + whole.length));
    } else {
      const s = whole.length > 0 ? (m.from[at] ?? 0) : (m.from[at] ?? m.to[at - 1] ?? 0);
      const e = whole.length > 0 ? (m.to[at + whole.length - 1] ?? s) : s;
      for (let k = 0; k < rep.length; k++) {
        out.from.push(s);
        out.to.push(e);
      }
    }
    last = at + whole.length;
  }
  parts.push(m.text.slice(last));
  out.from.push(...m.from.slice(last));
  out.to.push(...m.to.slice(last));
  out.text = parts.join('');
  return out;
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
