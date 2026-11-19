// v12's `parseGenericTypes` (`common.ts`), which class and ER diagrams both read a type's
// `~T~` generics with. A subpath of its own, so only the types that write generics load it.

/** The pair a generic's `~ … ~` becomes: `['<', '>']`, or `['&lt;', '&gt;']` for a label. */
export type GenericBrackets = readonly [open: string, close: string];

const LITERAL: GenericBrackets = ['<', '>'];

const tildes = (s: string): number => {
  let n = 0;
  for (const c of s) if (c === '~') n++;
  return n;
};

/** v12 `processSet`: the `~`s paired from both ends inwards become `open` … `close`. */
function processSet(input: string, [open, close]: GenericBrackets): string {
  const count = tildes(input);
  if (count <= 1) return input;
  let text = input;
  let lead = false;
  if (count % 2 !== 0 && text.startsWith('~')) {
    text = text.substring(1);
    lead = true;
  }
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === '~') at.push(i);
  const chars = text.split('');
  for (let k = 0; k < at.length - 1 - k; k++) {
    chars[at[k] ?? 0] = open;
    chars[at[at.length - 1 - k] ?? 0] = close;
  }
  return (lead ? '~' : '') + chars.join('');
}

/**
 * v12 `parseGenericTypes`: `List~int~` → `List<int>`, `Map~K, V~` → `Map<K, V>`. Commas split
 * the text into sets, joined again when the sets on both sides of a comma hold one `~` each.
 * `brackets` is what each pair becomes; a label passes `['&lt;', '&gt;']`, so the label layout
 * never reads `List<Data>` as a tag (D619, #945).
 */
export function parseGenericTypes(input: string, brackets: GenericBrackets = LITERAL): string {
  const sets: string[] = [];
  let from = 0;
  for (let i = 0; i <= input.length; i++) {
    if (i === input.length || input[i] === ',') {
      sets.push(input.slice(from, i));
      if (i < input.length) sets.push(',');
      from = i + 1;
    }
  }
  const out: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    let set = sets[i] ?? '';
    if (set === ',' && i > 0 && i + 1 < sets.length) {
      const prev = sets[i - 1] ?? '';
      const next = sets[i + 1] ?? '';
      if (tildes(prev) === 1 && tildes(next) === 1) {
        set = prev + ',' + next;
        i++;
        out.pop();
      }
    }
    out.push(processSet(set, brackets));
  }
  return out.join('');
}
