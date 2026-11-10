/**
 * Test-only (not exported, not built): a v12 diagram type with no v13 package yet, read from the
 * generated registry, so the specs that need "a type v13 cannot render" (R-COMPAT-7) follow the
 * ports as they land instead of naming one. When the last port lands there is none, and
 * `unportedType()` throws: replace those specs then.
 */
import { DETECTORS } from '../generated/detectors.gen.ts';

/** A header line `pattern` (a v12 detector) matches, ending in a line break. */
export function exampleOf(pattern: RegExp): string {
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

/** The first generated detector row with no v13 package, and a source it detects. */
export function unportedType(): { type: string; source: string } {
  const row = DETECTORS.find((r) => r.id === undefined);
  if (!row)
    throw new Error('Every v12 diagram type has a v13 package: no unported type to test with.');
  return { type: row.type, source: exampleOf(row.pattern) };
}
