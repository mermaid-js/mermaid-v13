/**
 * The requirement parser's tables (`./parser.ts`): the token kinds each rule takes, the display
 * values of v12's tables (`requirementDb.ts`), the human names of what the parser expects
 * (R-ERR-2, R-ERR-5) and the hints its messages add.
 */
import { ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import type {
  RelationshipKind,
  RequirementDirection,
  RequirementKind,
  RiskLevel,
  VerifyMethod,
} from '../model.ts';
import { T } from './tokens.ts';

export const REQ_KINDS = [
  T.Requirement,
  T.FunctionalRequirement,
  T.InterfaceRequirement,
  T.PerformanceRequirement,
  T.PhysicalRequirement,
  T.DesignConstraint,
];
export const KIND_OF: Readonly<Record<number, RequirementKind>> = {
  [T.Requirement]: 'Requirement',
  [T.FunctionalRequirement]: 'Functional Requirement',
  [T.InterfaceRequirement]: 'Interface Requirement',
  [T.PerformanceRequirement]: 'Performance Requirement',
  [T.PhysicalRequirement]: 'Physical Requirement',
  [T.DesignConstraint]: 'Design Constraint',
};
export const RISKS = [T.LowRisk, T.MedRisk, T.HighRisk];
export const RISK_OF: Readonly<Record<number, RiskLevel>> = {
  [T.LowRisk]: 'Low',
  [T.MedRisk]: 'Medium',
  [T.HighRisk]: 'High',
};
export const METHODS = [T.VerifyAnalysis, T.VerifyDemonstration, T.VerifyInspection, T.VerifyTest];
export const METHOD_OF: Readonly<Record<number, VerifyMethod>> = {
  [T.VerifyAnalysis]: 'Analysis',
  [T.VerifyDemonstration]: 'Demonstration',
  [T.VerifyInspection]: 'Inspection',
  [T.VerifyTest]: 'Test',
};
export const RELS = [T.Contains, T.Copies, T.Derives, T.Satisfies, T.Verifies, T.Refines, T.Traces];
export const REL_OF: Readonly<Record<number, RelationshipKind>> = {
  [T.Contains]: 'contains',
  [T.Copies]: 'copies',
  [T.Derives]: 'derives',
  [T.Satisfies]: 'satisfies',
  [T.Verifies]: 'verifies',
  [T.Refines]: 'refines',
  [T.Traces]: 'traces',
};
export const DIRECTIONS = [T.DirectionTB, T.DirectionBT, T.DirectionRL, T.DirectionLR];
export const DIRECTION_OF: Readonly<Record<number, RequirementDirection>> = {
  [T.DirectionTB]: 'TB',
  [T.DirectionBT]: 'BT',
  [T.DirectionRL]: 'RL',
  [T.DirectionLR]: 'LR',
};
export const REQ_FIELDS = [T.Id, T.Text, T.Risk, T.VerifyMethod];
export const ELEMENT_FIELDS = [T.Type, T.DocRef];
export const NAME = [T.UnqString, T.Quote];
/** An `idList` item: `ALPHA` in a style statement, else a name. */
export const ID_ITEM = [T.Alpha, T.UnqString, T.Quote];
export const STYLE_PART = [T.Alpha, T.Colon, T.Brkt, T.Minus, T.Semicolon];
export const NEWLINES = [Kind.Newline, T.NewlineAfterBlank];
const OTHER_STATEMENTS = [
  T.Style,
  T.ClassDef,
  T.Class,
  ...DIRECTIONS,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrOpen,
];
/** What may start a statement. */
export const STATEMENT = [...REQ_KINDS, T.Element, ...NAME, ...OTHER_STATEMENTS];
/** Statements that end a body left open (its `}` is missing). */
export const ENDS_BODY = kindSet(...REQ_KINDS, T.Element, ...OTHER_STATEMENTS, T.Eof, Kind.EOF);
/** Every keyword, for the hint where a name was expected. */
export const KEYWORDS = kindSet(
  T.Rd,
  ...REQ_FIELDS,
  ...ELEMENT_FIELDS,
  ...REQ_KINDS,
  ...RISKS,
  ...METHODS,
  T.Element,
  ...RELS,
  T.Style,
  T.ClassDef,
  T.Class
);

/** Where recovery resumes (R-PARSE-4). */
export const BOUNDARY = kindSet(Kind.EOF, Kind.Newline, T.NewlineAfterBlank, T.StyleEnd, T.Eof);
/** Where a failed definition header looks for its `{`. */
export const HEADER_SYNC = kindSet(
  Kind.EOF,
  Kind.Newline,
  T.NewlineAfterBlank,
  T.StyleEnd,
  T.Eof,
  T.StructStart
);
export const BODY_BOUNDARY = kindSet(
  Kind.EOF,
  Kind.Newline,
  T.NewlineAfterBlank,
  T.StyleEnd,
  T.Eof,
  T.StructStop
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
export const EXPECTED = new ExpectedTable([
  ['a requirement such as `requirement name {`', REQ_KINDS],
  ['an element such as `element name {`', [T.Element]],
  ['a name', [T.UnqString, T.Quote, T.Alpha]],
  ['`-` and a relationship, as in `a - satisfies -> b`', [T.Line]],
  ['`<-` and a relationship, as in `b <- satisfies - a`', [T.EndArrowL]],
  ['`->`', [T.EndArrowR]],
  ['a relationship such as `satisfies`, `traces` or `contains`', RELS],
  ['`:::` and a class name', [T.StyleSeparator]],
  ['`{`', [T.StructStart]],
  ['`}`', [T.StructStop]],
  ['a field such as `id: 1`, `text: …`, `risk: high` or `verifymethod: test`', REQ_FIELDS],
  ['a field such as `type: …` or `docref: …`', ELEMENT_FIELDS],
  ['`:` and a value', [T.ColonSep]],
  ['a risk: `low`, `medium` or `high`', RISKS],
  ['a method: `analysis`, `demonstration`, `inspection` or `test`', METHODS],
  ['a style such as `fill:#f9f`', STYLE_PART],
  ['`,`', [T.Comma]],
  ['a line break', NEWLINES],
  ['a statement such as `style`, `classDef`, `class`, `direction` or `accTitle`', OTHER_STATEMENTS],
  ['`requirementDiagram`', [T.Rd]],
  ['the end of the text', [Kind.EOF, T.Eof]],
]);

export const HEADER_HINT =
  'a requirement diagram starts with `requirementDiagram` on a line of its own';
export const HEADER_LINE_HINT =
  '`requirementDiagram` ends its line: start the statements on the next';
export const BRACE_LINE_HINT =
  '`{` ends its line: put each field, and the `}`, on a line of its own';
export const FIELD_LINE_HINT = 'each field ends its line: write one `key: value` per line';
export const REQUIREMENT_HINT =
  'write a requirement as `requirement name {`, then its fields one per line, then `}`';
export const ELEMENT_HINT =
  'write an element as `element name {`, then its fields one per line, then `}`';
export const REQUIREMENT_FIELD_HINT =
  'a requirement takes the fields `id`, `text`, `risk` and `verifymethod`';
export const ELEMENT_FIELD_HINT = 'an element takes the fields `type` and `docref`';
export const RELATION_HINT = 'write a relation as `a - satisfies -> b` or `b <- satisfies - a`';
export const SHORTHAND_HINT = 'write a class for a box as `name:::class`';
export const STYLE_HINT =
  'write it as `style <names> <styles>`, e.g. `style req fill:#f9f,stroke:#333`';
export const CLASSDEF_HINT =
  'write it as `classDef <names> <styles>`, e.g. `classDef hot fill:#f96`';
export const CLASS_HINT = 'write it as `class <names> <class names>`, e.g. `class req1,req2 hot`';
export const TITLE_HINT =
  'requirement diagrams have no `title` statement: set `title` in the front matter';
export const PERCENT_HINT = 'a style cannot hold `%`: write the value another way, e.g. in `px`';
export const STYLE_CHAR_HINT =
  'a style holds letters, digits, `_`, `:`, `#`, `-`, `;`, `,` and spaces only';
export const DIRECTION_HINT =
  'a direction is `direction TB`, `direction BT`, `direction LR` or `direction RL`';
export const STRAY_BRACE_HINT = 'a `}` closes the body of a requirement or element';
export const EMPTY_QUOTES_HINT = 'a quoted name or text may not be empty';
export const STATEMENT_HINT =
  'each statement is a requirement, an element, a relation or a styling statement';
export const NAMES = ['a name'];
export const CLASS_NAMES = ['a class name'];
export const TEXT_VALUE = ['a value, unquoted or in quotes'];
