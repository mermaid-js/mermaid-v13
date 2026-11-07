/** An author's `:::` classes as the SVG writes them, a rule text output shares (#466). */

/**
 * An author's `:::` classes as class names, each after a space: characters outside `[\w-]`
 * dropped, and a word left empty skipped. The empty string when the SVG adds no class.
 */
export function userClasses(names: readonly string[]): string {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
}
