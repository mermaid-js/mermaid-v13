/**
 * Test-only (not exported from `./testing`, not built): a v12 diagram type with no language
 * facet yet, read from the generated `firstPartyFacets`, so the specs that need "a type the
 * service knows but cannot read" (and the adapters' "a type with no highlighter") follow the
 * ports as they land instead of naming one. When the last facet lands there is none, and
 * `noFacetType()` throws: replace those specs then.
 */
import { firstPartyFacets } from '../generated/facets.gen.ts';

/** A header line `pattern` (a v12 detector) matches, ending in a line break. */
function exampleOf(pattern: RegExp): string {
  const header = pattern.source
    .replace(/^\^\\s\*/, '')
    // An optional group (`(Diagram)?`, `(-beta)?`) is left out.
    .replace(/\((?:\?:)?[^()]*\)\?/g, '')
    // A non-capturing tail (`(?:[\s:]|$)`) is the line break added below.
    .replace(/\(\?:[^()]*\)/g, '')
    // A group (`(graph|flowchart)`) is its first alternative.
    .replace(/\(([^()|]*)(?:\|[^()]*)?\)/g, '$1')
    .split('|')[0]!
    .replace(/\\b/g, '');
  const source = `${header}\n`;
  if (!pattern.test(source)) throw new Error(`exampleOf: ${pattern} does not match ${source}`);
  return source;
}

/** The first generated facet row with no `load`: its type, header word and a source of it. */
export function noFacetType(): { type: string; header: string; source: string } {
  const row = firstPartyFacets.find((r) => r.load === undefined && r.pattern !== undefined);
  if (!row)
    throw new Error(
      'Every v12 diagram type has a language facet: no facet-less type to test with.'
    );
  const source = exampleOf(row.pattern!);
  return { type: row.type, header: source.trimEnd(), source };
}
