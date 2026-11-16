// Scratch typed arrays for the layered layout, taken from one buffer that is used again and again
// instead of made anew for every call. A typed array longer than 64 bytes keeps its memory outside
// the JS heap, which makes it slow to make; a view of a buffer that is already there is not.
//
// The buffer is a stack. `scratch(run)` is a frame: the arrays taken while `run` runs, by it or by
// anything it calls, lie above where the stack stood when it began, and are given back when it ends,
// whether it returns or throws. A frame begun inside another lies above it, so no two arrays in use
// share memory however the layout nests (a level's layout inside a compound layout, the flat
// pre-layout beside it). An array must not outlive the frame it was taken in: nothing may keep one
// once the frame has returned. What is given back is zeroed, so an array taken is all zeros, as a
// new one is. Outside any frame, and past the end of the buffer, the arrays are new ones. When the
// outermost frame ends, the buffer grows to what the layouts have needed, but never past `CAP`.

// The most the buffer keeps between layouts.
export const CAP = 1 << 20;

let buf = new ArrayBuffer(0);
let top = 0;
let depth = 0;
let most = 0;

// Where an array of `bytes` starts in the buffer, or -1 when it has to be a new one.
function take(bytes: number): number {
  if (!depth) return -1;
  const at = top;
  // Every array starts on 8 bytes, as a Float64Array view must.
  top += (bytes + 7) & -8;
  if (top > most) most = top;
  return top > buf.byteLength ? -1 : at;
}

export function i32(n: number): Int32Array {
  const at = take(4 * n);
  return at < 0 ? new Int32Array(n) : new Int32Array(buf, at, n);
}

export function f64(n: number): Float64Array {
  const at = take(8 * n);
  return at < 0 ? new Float64Array(n) : new Float64Array(buf, at, n);
}

export function u8(n: number): Uint8Array {
  const at = take(n);
  return at < 0 ? new Uint8Array(n) : new Uint8Array(buf, at, n);
}

/** A scratch copy of the first `n` entries of `from`. */
export function copy(from: Int32Array, n: number): Int32Array {
  const to = i32(n);
  for (let i = 0; i < n; i++) to[i] = from[i]!;
  return to;
}

export function scratch<T>(run: () => T): T {
  const mark = top;
  depth++;
  try {
    return run();
  } finally {
    depth--;
    const end = Math.min(top, buf.byteLength);
    if (end > mark) new Uint8Array(buf, mark, end - mark).fill(0);
    top = mark;
    if (!depth && most > buf.byteLength && buf.byteLength < CAP)
      buf = new ArrayBuffer(Math.min(CAP, most));
  }
}

/** The buffer's size and what is in use, for tests. */
export function scratchState(): { size: number; top: number; depth: number } {
  return { size: buf.byteLength, top, depth };
}
