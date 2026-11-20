// The arguments of a click callback, a subpath of its own: only the diagrams and plugins that
// bind callbacks (class, the interactions plugin) load it, not every parser.
/**
 * The arguments of a `call fn(…)` callback (core's `AstCallback`), as v12's `setClickFunc`
 * passed them: `args` split at each comma followed by an even number of `"` up to the end
 * (`/,(?=(?:(?:[^"]*"){2})*[^"]*$)/`, here a linear scan), each item trimmed and stripped of
 * one pair of surrounding quotes (a lone `"` both starts and ends with one, so it becomes `''`,
 * as v12's `substr(1, length - 2)` gave); `[id]`, the element's id, when there are no
 * arguments.
 */
export function callbackArgs(id: string, args: string | undefined): string[] {
  if (args === undefined) return [id];
  let after = 0;
  for (const c of args) if (c === '"') after++;
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i <= args.length; i++) {
    const c = args[i];
    if (c === '"') after--;
    else if (i === args.length || (c === ',' && after % 2 === 0)) {
      const item = args.slice(from, i).trim();
      out.push(item.startsWith('"') && item.endsWith('"') ? item.slice(1, -1) : item);
      from = i + 1;
    }
  }
  return out;
}
