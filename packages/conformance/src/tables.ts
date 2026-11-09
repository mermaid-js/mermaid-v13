/**
 * The per-type rows of the shared oracle tables, each from its type's own `src/<type>/tables.ts`
 * (found by {@link importTypeFiles}). A port adds that file; no shared list names its type.
 *
 * A `tables.ts` exports any of:
 * - `jison`: its rows of {@link JISON_TYPES}, the jison lexer oracle and harvest (D212);
 * - `langium`: its rows of {@link LANGIUM_LEXERS}, the Langium lexer oracle (D213);
 * - `harvest`: its rows of {@link HARVESTS}, the v12 spec harvest of a Langium type.
 * Each is keyed by the type's name in that table (several rows for a package with several
 * grammars, such as railroad's notations). It must stay a leaf: data, and imports of types and
 * of `jison/types.ts` helpers only, so that the oracles that read these tables can be imported
 * by any type's code without a cycle.
 */
import type { Harvest } from './cli/harvest-v12.ts';
import type { JisonTypeDescriptor } from './jison/types.ts';
import type { LangiumLexerDescriptor } from './langium-lexer.ts';
import { exportsOnly, importTypeFiles, mergeRecords } from './type-files.ts';

/** What one type's `src/<type>/tables.ts` exports. */
export interface TypeTables {
  readonly jison?: Readonly<Record<string, JisonTypeDescriptor>>;
  readonly langium?: Readonly<Record<string, LangiumLexerDescriptor>>;
  readonly harvest?: Readonly<Record<string, Harvest>>;
}

const parts = await importTypeFiles('tables.ts', (module, where) => {
  exportsOnly(module, where, ['jison', 'langium', 'harvest']);
  return module as TypeTables;
});
const pick = <K extends keyof TypeTables>(key: K) =>
  parts.map(({ dir, module }) => ({ dir, record: module[key] }));

/** The jison types, by v13 diagram id (`src/<type>/tables.ts` `jison`). */
export const JISON_TYPES: Readonly<Record<string, JisonTypeDescriptor>> = mergeRecords(
  pick('jison'),
  'JISON_TYPES'
);

/** The Langium types, by v13 diagram id (`src/<type>/tables.ts` `langium`). */
export const LANGIUM_LEXERS: Readonly<Record<string, LangiumLexerDescriptor>> = mergeRecords(
  pick('langium'),
  'LANGIUM_LEXERS'
);

/** The Langium types harvested, by v13 diagram id (`src/<type>/tables.ts` `harvest`). */
export const HARVESTS: Readonly<Record<string, Harvest>> = mergeRecords(
  pick('harvest'),
  'HARVESTS'
);

/** `table[type]`, or an error naming the types it has (a mistyped type name, or no row yet). */
export function rowOf<V>(table: Readonly<Record<string, V>>, type: string, what: string): V {
  if (!Object.hasOwn(table, type))
    throw new Error(`${what} has no type "${type}" (it has ${Object.keys(table).join(', ')})`);
  return table[type]!;
}
