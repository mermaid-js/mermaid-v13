// Each top-level `let` outlives a render (R-ARCH-6, #1023).
let seed = 0;
let count = 0;
export let last: string | undefined;

export function next(): number {
  last = String(count++);
  return seed++;
}
