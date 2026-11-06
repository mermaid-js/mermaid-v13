// Which names can be a quadrant class name, where (the facet's rename check and completion ask).
import { quadrantCategories } from '../generated/categories.ts';
import { parseQuadrant, quadrantTokens } from '../parser/index.ts';

const HEADER = 'quadrantChart\n';
const DEF = 'classDef ';
const REF = 'A:::';

/**
 * Whether `name` reads back as exactly one class occurrence of `role`, the whole name and
 * nothing else, written into a one-statement document: `classDef <name> …` for a `def`,
 * `A:::<name>: […]` for a `ref`. `classDef` takes `-`, `,`, `:` and letters outside ASCII but
 * not `_`; `:::` takes `\w+` only.
 */
export function readsAs(name: string, role: 'def' | 'ref'): boolean {
  if (name === '' || /\s/.test(name)) return false;
  const text =
    role === 'def' ? `${HEADER}${DEF}${name} radius: 1\n` : `${HEADER}${REF}${name}: [0.5, 0.5]\n`;
  const at = HEADER.length + (role === 'def' ? DEF : REF).length;
  const { diagnostics, symbols } = parseQuadrant(text);
  const hit = symbols.length === 1 ? symbols[0] : undefined;
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hit?.kind === 'class' &&
    hit.role === role &&
    hit.name === name &&
    hit.range.start === at &&
    hit.range.end === at + name.length
  );
}

/**
 * Why `name` cannot be a class name, if it cannot. A class is defined by `classDef <name>` and
 * given by `:::name`, so the name must read back as itself in both.
 */
export function classReason(name: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A name cannot contain a line break.';
  if (/\s/.test(name)) return 'A name cannot contain spaces.';
  if (readsAs(name, 'def') && readsAs(name, 'ref')) return undefined;
  const defAt = HEADER.length + DEF.length;
  const first = quadrantTokens(`${HEADER}${DEF}${name} radius: 1\n`).find(
    (t) => t.range.start === defAt
  );
  if (first && quadrantCategories[first.kind] === 'Keyword') return `'${name}' is a keyword.`;
  return `'${name}' is not a class name: \`classDef\` and \`:::\` take letters and digits only.`;
}
