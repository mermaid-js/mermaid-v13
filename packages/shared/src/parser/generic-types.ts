/**
 * v12's `parseGenericTypes` (`diagrams/common/common.ts`), which class and ER diagrams both
 * ran over a type's text: `List~int~` → `List<int>`, `Map~K, V~` → `Map<K, V>`.
 */

/** The pair a generic's `~ … ~` becomes. */
export type Brackets = readonly [open: string, close: string];

/** `<` and `>`, as v12's text had them. */
export const LITERAL: Brackets = Object.freeze(['<', '>'] as const);

/**
 * `&lt;` and `&gt;`, for text that goes to core's label layout: `List~Data~` is then drawn
 * `List<Data>` and never read as a `<data>` tag (D619, #945).
 */
export const REFERENCES: Brackets = Object.freeze(['&lt;', '&gt;'] as const);

const tildes = (s: string): number => {
  let n = 0;
  for (const c of s) if (c === '~') n++;
  return n;
};

/** v12 `processSet`: the `~`s paired from both ends inwards become `open` … `close`. */
function processSet(input: string, [open, close]: Brackets): string {
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

/** The text split at each comma, the commas kept as sets of their own: `a,b` → `a`, `,`, `b`. */
function splitSets(input: string): string[] {
  const sets: string[] = [];
  let from = 0;
  for (let at = input.indexOf(','); at !== -1; at = input.indexOf(',', from)) {
    sets.push(input.slice(from, at), ',');
    from = at + 1;
  }
  sets.push(input.slice(from));
  return sets;
}

/**
 * v12 `parseGenericTypes`, with each generic's `~ … ~` as `brackets`. Commas split the text
 * into sets, joined again when the sets on both sides of a comma hold one `~` each.
 */
export function parseGenericTypes(input: string, brackets: Brackets = LITERAL): string {
  const sets = splitSets(input);
  const out: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    const prev = sets[i - 1] ?? '';
    const next = sets[i + 1] ?? '';
    const joins = sets[i] === ',' && i > 0 && i + 1 < sets.length;
    if (joins && tildes(prev) === 1 && tildes(next) === 1) {
      out.pop();
      out.push(processSet(prev + ',' + next, brackets));
      i++;
    } else {
      out.push(processSet(sets[i] ?? '', brackets));
    }
  }
  return out.join('');
}
