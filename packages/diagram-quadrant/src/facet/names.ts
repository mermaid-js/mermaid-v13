// Which names can be a quadrant class name (the facet's rename check asks).
import { quadrantCategories } from '../generated/categories.ts';
import { parseQuadrant, quadrantTokens } from '../parser/index.ts';

const HEADER = 'quadrantChart\n';
const DEF = 'classDef ';

/**
 * Why `name` cannot be a class name, if it cannot. A class is defined by `classDef <name>` and
 * given by `:::name`, so the name must read back as itself in both: a probe document with one
 * of each must parse cleanly to exactly those two class occurrences.
 */
export function classReason(name: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A name cannot contain a line break.';
  if (/\s/.test(name)) return 'A name cannot contain spaces.';
  const defAt = HEADER.length + DEF.length;
  const def = `${HEADER}${DEF}${name} radius: 1\n`;
  const refAt = def.length + 'A:::'.length;
  const text = `${def}A:::${name}: [0.5, 0.5]\n`;
  const { diagnostics, symbols } = parseQuadrant(text);
  const hits = symbols.filter((s) => s.kind === 'class');
  const at = (i: number, start: number) => {
    const hit = hits[i];
    return hit?.name === name && hit.range.start === start && hit.range.end === start + name.length;
  };
  if (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 2 &&
    at(0, defAt) &&
    at(1, refAt)
  ) {
    return undefined;
  }
  const first = quadrantTokens(def).find((t) => t.range.start === defAt);
  if (first && quadrantCategories[first.kind] === 'Keyword') return `'${name}' is a keyword.`;
  return `'${name}' is not a class name: \`classDef\` and \`:::\` take letters and digits only.`;
}
