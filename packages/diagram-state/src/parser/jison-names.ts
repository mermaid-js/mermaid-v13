// cspell:words composit
import { Kind } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/**
 * The v12 `stateDiagram.jison` terminal each kind stands for (dev and test use: the
 * lexer-parity gate compares token streams by these names). Kinds jison has no terminal for
 * are absent. `ERROR` is not a terminal: it marks where v12's lexer threw. Never shown to
 * users (R-ERR-5).
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Sd]: 'SD',
  [Kind.Newline]: 'NL',
  [T.EndOfInput]: 'NL',
  [T.Click]: 'CLICK',
  [T.Href]: 'HREF',
  [T.String]: 'STRING',
  [T.Default]: 'DEFAULT',
  [T.DirectionTB]: 'direction_tb',
  [T.DirectionBT]: 'direction_bt',
  [T.DirectionRL]: 'direction_rl',
  [T.DirectionLR]: 'direction_lr',
  [T.Scale]: 'scale',
  [T.Width]: 'WIDTH',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.ClassDef]: 'classDef',
  [T.DefaultClassDefId]: 'DEFAULT_CLASSDEF_ID',
  [T.ClassDefId]: 'CLASSDEF_ID',
  [T.ClassDefStyleOpts]: 'CLASSDEF_STYLEOPTS',
  [T.Class]: 'class',
  [T.ClassEntityIds]: 'CLASSENTITY_IDS',
  [T.StyleClass]: 'STYLECLASS',
  [T.Style]: 'style',
  [T.StyleIds]: 'STYLE_IDS',
  [T.StyleDefStyleOpts]: 'STYLEDEF_STYLEOPTS',
  [T.Fork]: 'FORK',
  [T.Join]: 'JOIN',
  [T.Choice]: 'CHOICE',
  [T.As]: 'AS',
  [T.Id]: 'ID',
  [T.StateDescr]: 'STATE_DESCR',
  [T.CompositeState]: 'COMPOSIT_STATE',
  [T.MultiWordState]: 'ERROR',
  [T.StructStart]: 'STRUCT_START',
  [T.StructStop]: 'STRUCT_STOP',
  [T.Note]: 'note',
  [T.LeftOf]: 'left_of',
  [T.RightOf]: 'right_of',
  [T.NoteText]: 'NOTE_TEXT',
  [T.HideEmpty]: 'HIDE_EMPTY',
  [T.EdgeState]: 'EDGE_STATE',
  [T.Descr]: 'DESCR',
  [T.Arrow]: '-->',
  [T.Concurrent]: 'CONCURRENT',
  [T.StyleSeparator]: 'STYLE_SEPARATOR',
  [T.Invalid]: 'INVALID',
  [Kind.Error]: 'ERROR',
};
