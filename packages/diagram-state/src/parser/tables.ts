/**
 * The state parser's constant tables: what it accepts at each decision point (constant lists,
 * so a parse without a probe allocates nothing for them), the human names of what it expects
 * (R-ERR-2, R-ERR-5) and the hints its messages give.
 */
import { ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import type { StateDirection } from './model.ts';
import { T } from './tokens.ts';

export const NL = [Kind.Newline, T.EndOfInput];
export const BOUNDARY = kindSet(Kind.Newline, T.EndOfInput, Kind.EOF);
export const BOUNDARY_IN_COMPOSITE = kindSet(Kind.Newline, T.EndOfInput, Kind.EOF, T.StructStop);
export const DIRECTIONS: Readonly<Record<number, StateDirection>> = {
  [T.DirectionTB]: 'TB',
  [T.DirectionBT]: 'BT',
  [T.DirectionRL]: 'RL',
  [T.DirectionLR]: 'LR',
};
export const PSEUDO: Readonly<Record<number, 'fork' | 'join' | 'choice'>> = {
  [T.Fork]: 'fork',
  [T.Join]: 'join',
  [T.Choice]: 'choice',
};

// What the parser accepts at its decision points (constant lists: a parse without a probe
// allocates nothing for them).
export const STATEMENT_KINDS = [
  T.Id,
  T.EdgeState,
  T.CompositeState,
  T.StateDescr,
  T.Fork,
  T.Join,
  T.Choice,
  T.Note,
  T.ClassDef,
  T.Class,
  T.Style,
  T.DirectionTB,
  T.DirectionBT,
  T.DirectionRL,
  T.DirectionLR,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrMultilineValue,
  T.Click,
  T.HideEmpty,
  T.Scale,
  T.Embed,
];
export const DOC_KINDS = [...STATEMENT_KINDS, ...NL, Kind.EOF];
export const COMPOSITE_DOC_KINDS = [...STATEMENT_KINDS, T.Concurrent, ...NL, T.StructStop];
export const HEADER = [T.Sd];
export const HEADER_START = [T.Sd, ...NL];
export const ID_KINDS = [T.Id, T.EdgeState];
export const ID_ONLY = [T.Id];
export const AFTER_ID = [T.StyleSeparator, T.Descr, T.Arrow];
/** After a statement's first id: `@{ view: collapsed }` too (#670). */
export const AFTER_STATE = [...AFTER_ID, T.EmbedFold];
export const AFTER_TARGET = [T.StyleSeparator, T.Descr];
export const STRUCT_START = [T.StructStart];
export const STRUCT_STOP = [T.StructStop];
export const AS = [T.As];
export const CLASSDEF_ID = [T.ClassDefId];
export const CLASSDEF_STYLES = [T.ClassDefStyleOpts];
export const STYLE_IDS = [T.StyleIds];
export const STYLE_STYLES = [T.StyleDefStyleOpts];
export const CLASS_IDS = [T.ClassEntityIds];
export const CLASS_NAME = [T.StyleClass];
export const NOTE_AFTER = [T.LeftOf, T.RightOf, T.NoteText];
export const NOTE_TEXT = [T.NoteText];
export const WIDTH = [T.Width];
export const TITLE = [T.AccTitleValue];
export const DESCR_VALUE = [T.AccDescrValue];
export const CLICK_ACTION = [T.String, T.Href];
export const STRING = [T.String];
export const EMBED_ID = [T.EmbedId];
export const EMBED_AFTER_ID = [T.EmbedTitle, T.EmbedOpen];
export const EMBED_OPEN = [T.EmbedOpen];
export const EMBED_BODY = [T.EmbedBody];
export const EMBED_END = [T.EmbedEnd];

/** Kinds a probe's cursor follows rather than extends: punctuation. */
export const PROBE_FOLLOWS = kindSet(
  T.Arrow,
  T.StyleSeparator,
  T.StructStart,
  T.StructStop,
  T.Concurrent
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
export const EXPECTED = new ExpectedTable([
  ['`stateDiagram` or `stateDiagram-v2`', [T.Sd]],
  ['a state such as `A` or `[*]`', [T.Id, T.EdgeState]],
  ['an arrow `-->`', [T.Arrow]],
  ['`:::` and a class name', [T.StyleSeparator]],
  ['a description such as `: text`', [T.Descr]],
  ['`as` and a state id', [T.As]],
  ['`{`', [T.StructStart]],
  ['`}`', [T.StructStop]],
  ['a class name', [T.ClassDefId, T.StyleClass]],
  ['state ids such as `A,B`', [T.StyleIds, T.ClassEntityIds]],
  ['styles such as `fill:#f96`', [T.ClassDefStyleOpts, T.StyleDefStyleOpts]],
  ['`left of` or `right of`', [T.LeftOf, T.RightOf]],
  ['note text', [T.NoteText]],
  ['a quoted string', [T.String]],
  ['`href`', [T.Href]],
  ['a width such as `200`', [T.Width]],
  ['a title', [T.AccTitleValue]],
  ['a description', [T.AccDescrValue]],
  ['`--` between regions', [T.Concurrent]],
  ['a block id', [T.EmbedId]],
  ['a block title such as `["Title"]`', [T.EmbedTitle]],
  ['`{` at the end of the line', [T.EmbedOpen]],
  ['`}` on its own line, closing the block', [T.EmbedEnd]],
  ['`@{ view: collapsed }`', [T.EmbedFold]],
  [
    'a statement such as `state`, `note`, `classDef`, `class` or `style`',
    [
      T.CompositeState,
      T.StateDescr,
      T.Fork,
      T.Join,
      T.Choice,
      T.Note,
      T.ClassDef,
      T.Class,
      T.Style,
      T.DirectionTB,
      T.DirectionBT,
      T.DirectionRL,
      T.DirectionLR,
      T.AccTitle,
      T.AccDescr,
      T.AccDescrMultilineValue,
      T.Click,
      T.HideEmpty,
      T.Scale,
      T.Embed,
    ],
  ],
  ['a line break', [Kind.Newline, T.EndOfInput]],
  ['the end of the text', [Kind.EOF]],
]);

/** How each statement is written, for errors inside it. */
export const HINTS: Readonly<Record<number, string>> = {
  [T.ClassDef]: 'write it as `classDef <name> <styles>`, e.g. `classDef hot fill:#f96`',
  [T.Class]: 'write it as `class <state ids> <class name>`, e.g. `class A,B hot`',
  [T.Style]: 'write it as `style <state ids> <styles>`, e.g. `style A fill:#f96`',
  [T.Note]:
    'write it as `note left of <state> : <text>`, or `note right of <state>`, the text on the lines after it, then `end note`',
  [T.Click]: 'write it as `click <state> "<url>" "<tooltip>"` or `click <state> href "<url>"`',
  [T.StateDescr]: 'write it as `state "<description>" as <id>`',
  [T.Scale]: 'write it as `scale <number> width`',
  [T.Embed]: 'write it as `mermaid <id>["Title"] {`, then the diagram, then `}` on its own line',
};

/** Why a token cannot start a statement, for the ones authors put there. */
export const MISPLACED: Readonly<Record<number, string>> = {
  [T.StructStart]: 'a composite state is written `state <id> {`',
  [T.Descr]: 'a description follows a state id, e.g. `A : waiting`',
  [T.String]: 'quoted text is a description, e.g. `state "Waiting" as W`',
  [T.Default]: '`default` is a keyword: use another state id',
  [T.Href]: '`href` is a keyword: use another state id',
  [T.Arrow]: 'a transition starts at a state, e.g. `A --> B`',
};
