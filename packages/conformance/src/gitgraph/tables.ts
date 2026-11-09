/** gitgraph's rows in the shared oracle tables (`src/tables.ts`). */
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  gitGraph: { probe: 'gitGraph\n  commit', factory: 'createGitGraphServices', key: 'GitGraph' },
} satisfies Record<string, LangiumLexerDescriptor>;
