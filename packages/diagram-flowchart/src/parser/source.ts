/**
 * What v12 did to flowchart text before its lexer saw it, reproduced without rewriting the
 * source (DESIGN §4.1). v12 ran these rewrites, in order:
 *
 * 1. `cleanupText`: CRLF → LF, and `="x"` → `='x'` inside every `<tag …>`;
 * 2. directives removed, then every line comment (`^\s*%%(?!{)[^\n]+\n?`, multiline) removed;
 * 3. `encodeEntities`: on a line holding `style…:…#…;` (then `classDef…`), the last `;` is
 *    dropped; then every `#name;` / `#123;` becomes an entity placeholder;
 * 4. `flowParser`: `}\s*\n` → `}\n`; and a `\n` is appended.
 *
 * v13 keeps the source as written. Here we compute, in linear scans, *where* those rewrites
 * would have acted: removed spans (comments and directives, emitted as trivia), converted
 * quotes and dropped semicolons (a per-offset mask). The lexer and {@link cook}, which builds
 * label text from a source range, consult them.
 */
import { isSpace } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';

/** Mask bit: a `"` that v12 turned into `'` (an HTML attribute quote). */
export const QUOTE = 1;
/** Mask bit: a `;` that v12's `encodeEntities` dropped. */
export const DROP = 2;

export interface SourceView {
  /** Per-offset {@link QUOTE}/{@link DROP} bits, or undefined when nothing is marked. */
  mask: Uint8Array | undefined;
  /** Removed spans in source order: directives and line comments. */
  holes: Hole[];
}

export interface Hole extends Range {
  /** A line comment, a directive, or a `;` that `encodeEntities` dropped. */
  kind: 'comment' | 'directive' | 'drop';
}

const isNl = (c: number) => c === 10 || c === 13;
const isWordCode = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

export function sourceView(src: string, from: number, directives: readonly Range[]): SourceView {
  let mask: Uint8Array | undefined;
  const mark = (i: number, bit: number) => {
    mask ??= new Uint8Array(src.length);
    mask[i] = (mask[i] ?? 0) | bit;
  };
  markTagQuotes(src, from, mark);
  markDroppedSemicolons(src, from, mark, () => mask);
  const removed = holes(src, from, directives);
  const m = mask as Uint8Array | undefined;
  if (m) {
    const spans = removed.length;
    let k = 0;
    for (let i = from; i < m.length; i++) {
      if (!((m[i] ?? 0) & DROP)) continue;
      while (k < spans && (removed[k]?.end ?? 0) <= i) k++;
      const h = k < spans ? removed[k] : undefined;
      if (!h || h.start > i) removed.push({ start: i, end: i + 1, kind: 'drop' });
    }
    removed.sort((a, b) => a.start - b.start);
  }
  return { mask, holes: removed };
}

/** `<(\w+)([^>]*)>` then `="([^"]*)"` inside the attributes: both quotes become `'`. */
function markTagQuotes(src: string, from: number, mark: (i: number, bit: number) => void): void {
  let gt = -1;
  let i = src.indexOf('<', from);
  while (i !== -1 && i + 1 < src.length) {
    if (!isWordCode(src.charCodeAt(i + 1))) {
      i = src.indexOf('<', i + 1);
      continue;
    }
    if (gt < i) gt = src.indexOf('>', i);
    if (gt === -1) return;
    let j = i + 1;
    while (j < gt) {
      if (src.charCodeAt(j) === 61 && src.charCodeAt(j + 1) === 34) {
        let close = j + 2;
        while (close < gt && src.charCodeAt(close) !== 34) close++;
        if (close >= gt) break;
        mark(j + 1, QUOTE);
        mark(close, QUOTE);
        j = close + 1;
      } else j++;
    }
    i = src.indexOf('<', gt + 1);
  }
}

/**
 * `style.*:\S*#.*;` then `classDef.*:\S*#.*;` (each global, `.` stops at line ends): the
 * match ends at the line's last `;`, which `encodeEntities` cut off.
 */
function markDroppedSemicolons(
  src: string,
  from: number,
  mark: (i: number, bit: number) => void,
  current: () => Uint8Array | undefined
): void {
  if (!src.includes(';')) return;
  const words = ['style', 'classDef'];
  const next = [-2, -2];
  let ls = from;
  while (ls <= src.length) {
    let le = ls;
    while (le < src.length && !isNl(src.charCodeAt(le))) le++;
    for (let w = 0; w < 2; w++) {
      const word = words[w] ?? '';
      if ((next[w] ?? 0) !== -1 && (next[w] ?? 0) < ls) next[w] = src.indexOf(word, ls);
      const k = next[w] ?? -1;
      if (k === -1 || k >= le) continue;
      const m = current();
      const gone = (x: number) => m !== undefined && ((m[x] ?? 0) & DROP) !== 0;
      let colon = false;
      let hash = -1;
      for (let j = k + word.length; j < le; j++) {
        const c = src.charCodeAt(j);
        if (gone(j)) continue;
        if (c === 58) colon = true;
        else if (c === 35 && colon) {
          hash = j;
          break;
        } else if (isSpace(c)) colon = false;
      }
      if (hash < 0) continue;
      for (let j = le - 1; j > hash; j--) {
        if (src.charCodeAt(j) === 59 && !gone(j)) {
          mark(j, DROP);
          break;
        }
      }
    }
    if (le >= src.length) break;
    ls = le + (src.charCodeAt(le) === 13 && src.charCodeAt(le + 1) === 10 ? 2 : 1);
  }
}

/** Directive spans plus the line comments v12 removed after them. */
function holes(src: string, from: number, directives: readonly Range[]): Hole[] {
  const out: Hole[] = [];
  let d = 0;
  // Next directive at or after `i`, as an index into `directives`.
  const dirAt = (i: number) => {
    while (d < directives.length && (directives[d]?.end ?? 0) <= i) d++;
    const r = directives[d];
    return r && r.start === i ? r : undefined;
  };
  let ls = from;
  while (ls < src.length) {
    // Skip whitespace (and removed directives) from this line start.
    let q = ls;
    while (q < src.length) {
      const r = dirAt(q);
      if (r) q = r.end;
      else if (isSpace(src.charCodeAt(q))) q++;
      else break;
    }
    if (
      src.charCodeAt(q) === 37 &&
      src.charCodeAt(q + 1) === 37 &&
      src.charCodeAt(q + 2) !== 123 &&
      q + 2 < src.length &&
      !isNl(src.charCodeAt(q + 2))
    ) {
      let e = q + 2;
      while (e < src.length && !isNl(src.charCodeAt(e))) e++;
      if (src.charCodeAt(e) === 13) e++;
      if (src.charCodeAt(e) === 10) e++;
      out.push({ start: ls, end: e, kind: 'comment' });
      ls = e;
      continue;
    }
    // No comment from any line start up to q; continue at the first line start after q.
    let e = q;
    while (e < src.length && !isNl(src.charCodeAt(e))) e++;
    if (e >= src.length) break;
    ls = e + (src.charCodeAt(e) === 13 && src.charCodeAt(e + 1) === 10 ? 2 : 1);
  }
  // Merge in the directives that no comment swallowed, in source order.
  const all: Hole[] = [...out];
  for (const r of directives) {
    if (r.start < from) continue;
    if (!out.some((h) => h.start <= r.start && r.end <= h.end)) {
      all.push({ start: r.start, end: r.end, kind: 'directive' });
    }
  }
  return all.sort((a, b) => a.start - b.start);
}

/**
 * The text v12's parser saw for the source range `[start, end)` (one label or value), with
 * entity placeholders already decoded back to `&name;` / `&#123;` as v12's renderer did.
 * Removed spans inside the range are skipped.
 */
export function cook(src: string, start: number, end: number, view: SourceView): string {
  const raw = src.slice(start, end);
  const mask = view.mask;
  if (
    !/[\r#}]/.test(raw) &&
    src.charCodeAt(start - 1) !== 125 &&
    !hasHole(view, start, end) &&
    !masked(mask, start, end)
  )
    return raw;
  let out = '';
  let h = firstHole(view, start);
  for (let i = start; i < end; i++) {
    while (h < view.holes.length && (view.holes[h]?.end ?? 0) <= i) h++;
    const hole = view.holes[h];
    if (hole && hole.start <= i) {
      i = hole.end - 1;
      continue;
    }
    const c = src.charCodeAt(i);
    const bits = mask?.[i] ?? 0;
    if (bits & DROP) continue;
    if (bits & QUOTE) {
      out += "'";
      continue;
    }
    if (c === 13) {
      out += '\n';
      if (src.charCodeAt(i + 1) === 10) i++;
      continue;
    }
    if (c === 35) {
      let j = i + 1;
      while (j < end && isWordCode(src.charCodeAt(j))) j++;
      if (j > i + 1 && j < end && src.charCodeAt(j) === 59 && !((mask?.[j] ?? 0) & DROP)) {
        const name = src.slice(i + 1, j);
        out += /^\d+$/.test(name) ? `&#${name};` : `&${name};`;
        i = j;
        continue;
      }
    }
    if (c === 125 || (i === start && src.charCodeAt(i - 1) === 125 && isSpace(c))) {
      const at = c === 125 ? i + 1 : i;
      if (c === 125) out += '}';
      let j = at;
      let nl = -1;
      while (j < end && isSpace(src.charCodeAt(j))) {
        if (isNl(src.charCodeAt(j))) nl = j;
        j++;
      }
      // v12 appended a line break, so blanks up to the end of the text reach one too; the
      // final line break itself belongs to no source text.
      if (j >= src.length) {
        i = j - 1;
        continue;
      }
      if (nl >= 0) {
        out += '\n';
        i = src.charCodeAt(nl) === 13 && src.charCodeAt(nl + 1) === 10 ? nl + 1 : nl;
        continue;
      }
      if (c === 125) continue;
    }
    out += src[i];
  }
  return out;
}

function hasHole(view: SourceView, start: number, end: number): boolean {
  const h = view.holes[firstHole(view, start)];
  return h !== undefined && h.start < end;
}

/** Index of the first hole that ends after `at`. */
export function firstHole(view: SourceView, at: number): number {
  const hs = view.holes;
  let lo = 0;
  let hi = hs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((hs[mid]?.end ?? 0) <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function masked(mask: Uint8Array | undefined, start: number, end: number): boolean {
  if (!mask) return false;
  for (let i = start; i < end; i++) if (mask[i]) return true;
  return false;
}
