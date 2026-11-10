/**
 * Test-only: a v12 diagram type with no v13 package yet, so the support specs follow the ports
 * as they land instead of naming one. The language service's `firstPartyFacets` lists every v12
 * type with its detector in the registry's order; the first that `mermaid` cannot render as SVG
 * is it. When the last port lands there is none, and `unportedType()` throws.
 */
import { firstPartyFacets } from '@mermaid-js/language-service';
import { supportsFormat } from 'mermaid';

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

/** The first v12 type with no v13 package, and a source it detects. */
export function unportedType(): { type: string; source: string } {
  const row = firstPartyFacets.find((r) => r.pattern && !supportsFormat(r.type, 'svg'));
  if (!row)
    throw new Error('Every v12 diagram type has a v13 package: no unported type to test with.');
  return { type: row.type, source: exampleOf(row.pattern!) };
}
