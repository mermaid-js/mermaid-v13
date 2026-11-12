/** The line helper the C4 facet's completion reads. */
/** The text of the line before `at`. */
export function lineBefore(text: string, at: number): string {
  let from = at;
  while (from > 0 && !/[\n\r]/.test(text.charAt(from - 1))) from--;
  return text.slice(from, at);
}
