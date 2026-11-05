// Types for the two Monaco internals the test helper runs (`./monarch.ts`); Monaco ships no
// declarations for them.
declare module 'monaco-editor/editor/standalone/common/monarch/monarchCompile.js' {
  export function compile(languageId: string, json: unknown): unknown;
}

declare module 'monaco-editor/editor/standalone/common/monarch/monarchLexer.js' {
  export class MonarchTokenizer {
    constructor(
      languageService: unknown,
      themeService: unknown,
      languageId: string,
      lexer: unknown,
      configurationService: unknown
    );
    getInitialState(): unknown;
    tokenize(
      line: string,
      hasEOL: boolean,
      state: unknown
    ): { tokens: { offset: number; type: string }[]; endState: unknown };
  }
}
