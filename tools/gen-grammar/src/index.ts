/**
 * Grammar file to reference parser, fuzz sentences, highlighters and syntax docs (DESIGN §4.4,
 * R-PARSE-9, D54). Dev and CI only: nothing here ships at runtime.
 */
export { parseGrammar, symbolsOf } from './ebnf.ts';
export type { Expr, Grammar, GrammarRule, LexAction, LexRule } from './ebnf.ts';
export { buildLexer } from './mode-lexer.ts';
export type { LexResult, LexToken, ModeLexer } from './mode-lexer.ts';
export { appendMapped, mapped, replaceMapped, sliceMapped, sourceRange } from './mapped-text.ts';
export type { MappedText } from './mapped-text.ts';
export { astOf, buildParser, flatten } from './earley.ts';
export type { AstShape, ParseNode, Production, ReferenceParser } from './earley.ts';
export { buildGenerator, emptyModel, learnDerivation, learnToken } from './sentences.ts';
export type { GenerateOptions, Sentence, SentenceGenerator, SentenceModel } from './sentences.ts';
export {
  lezerGrammar,
  lezerTokenNames,
  categoryOf,
  lezerTokens,
  monarch,
  nonCapturing,
  textMate,
} from './highlight.ts';
export type { HighlightNames } from './highlight.ts';
export { ebnfText, syntaxDoc } from './syntax-doc.ts';
export { categoriesModule, categoryTable, kindKeys } from './categories.ts';
export type { CategoryTable, KindSource } from './categories.ts';
export {
  GRAMMARS,
  generate,
  generateFor,
  generatedDir,
  grammarPath,
  sourceDir,
} from './generate.ts';
export type { GrammarTarget } from './generate.ts';
