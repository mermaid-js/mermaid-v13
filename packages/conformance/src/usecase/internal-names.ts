/**
 * What a usecase message must never name (R-ERR-5): v12's Chevrotain token names, v13's token
 * kind names and v12's grammar rule names (`usecase.parser.ts`). The recovery and messages
 * specs share it.
 */
import { CHEVROTAIN_NAMES, UsecaseTokenKind } from '@mermaid-js/diagram-usecase/testing';

/** v12's rule names (`usecase.parser.ts`), but those that are also plain words (`start`, …). */
export const V12_RULES = [
  'lineEnd',
  'blankLine',
  'commentLine',
  'accTitleStatement',
  'accDescrStatement',
  'actorStatement',
  'actorItem',
  'actorName',
  'actorDeclarationOnly',
  'entityStatement',
  'entityName',
  'nodeLabel',
  'useCaseMetadata',
  'relationTail',
  'edgeLabel',
  'semanticRelation',
  'metadataProperty',
  'metadataSeparator',
  'systemBoundaryStatement',
  'systemBoundaryName',
  'systemBoundaryContent',
  'boundaryElement',
  'metadataAssignmentStatement',
  'metadataAssignmentTarget',
  'noteStatement',
  'classSuffix',
  'jsonStatement',
  'directionStatement',
  'classDefStatement',
  'classStatement',
  'styleStatement',
  'styleValue',
  'styleComponent',
];

/** Token and rule names as whole words: Chevrotain's (but `JSON`, the format's name), v13's. */
export const INTERNAL_NAMES = new RegExp(
  `\\b(?:${[
    ...Object.values(CHEVROTAIN_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n) && n !== 'JSON'),
    ...Object.keys(UsecaseTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    ...V12_RULES,
  ].join('|')})\\b`
);

/** A message without what it quotes from the source (a token after `got`, an id). */
export const withoutQuotes = (message: string): string =>
  message.replace(/`[^`\n]*`/g, '`…`').replace(/'[^'\n]*'/g, "'…'");
