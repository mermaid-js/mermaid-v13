/**
 * Embedded diagram blocks (ADR-15): a block's body as it is detected and parsed (D633). The
 * render (`mermaid`'s block pass) and the editor (the language service) both read a body
 * through {@link blockBody}, so they see the same text and place errors the same way.
 *
 * A subpath of its own (`@mermaid-js/core/parser-kit/embed-body`), not in the parser-kit barrel:
 * the CDN build splits by file, so every diagram that imports the barrel would load it.
 */

/** A block body without its common indentation, and the way back to the body as written. */
export interface BlockBody {
  /** The body with the indentation common to its non-blank lines removed. */
  readonly text: string;
  /** The offset in the body as written of offset `at` in {@link text}. */
  readonly outer: (at: number) => number;
}

const same = (at: number): number => at;

/** The spaces and tabs a line starts with. */
function indentOf(line: string): number {
  let n = 0;
  while (line[n] === ' ' || line[n] === '\t') n++;
  return n;
}

/**
 * `written` (a body, from the line after its opener's `{`) without the indentation common to
 * its non-blank lines. A blank line does not count, and loses at most that much. Without such
 * an indentation the body is returned as written.
 */
export function blockBody(written: string): BlockBody {
  const lines = written.split('\n');
  let common = Infinity;
  for (const line of lines) if (line.trim() !== '') common = Math.min(common, indentOf(line));
  if (common === 0 || common === Infinity) return { text: written, outer: same };
  // starts[i]: where line i starts in the text; removed[i]: characters removed up to line i.
  const starts: number[] = [];
  const removed: number[] = [];
  const out: string[] = [];
  let at = 0;
  let total = 0;
  for (const line of lines) {
    const cut = Math.min(common, indentOf(line));
    total += cut;
    starts.push(at);
    removed.push(total);
    out.push(line.slice(cut));
    at += line.length - cut + 1;
  }
  const outer = (offset: number): number => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return offset + removed[lo]!;
  };
  return { text: out.join('\n'), outer };
}
