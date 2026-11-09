/**
 * Usecase's own diagnostic codes, one definition each. The model's codes stand for the errors
 * v12's model builder threw (`usecaseModelBuilder.ts`), each now a diagnostic with v12's message
 * minus its location (D473). Syntax codes shared with other types (`UNEXPECTED`,
 * `UNEXPECTED_CHARACTER`, `UNCLOSED_STRING`) are core's or other diagrams' as well.
 */

/** Two declarations of one id disagree: kind, label, shape, boundary, stereotype or metadata. */
export const USECASE_CONFLICT = 'USECASE_CONFLICT';
/** An id declared twice where only one is allowed: a JSON table, an edge id, a generated id. */
export const USECASE_DUPLICATE_ID = 'USECASE_DUPLICATE_ID';
/** A metadata, note, `class` or `style` target that no element declares. */
export const USECASE_UNRESOLVED = 'USECASE_UNRESOLVED';
/** A metadata key or value the target does not take. */
export const USECASE_INVALID_METADATA = 'USECASE_INVALID_METADATA';
/** A relation whose ends cannot take it (a boundary end, an include between actors, …). */
export const USECASE_INVALID_RELATION = 'USECASE_INVALID_RELATION';
/** `A --> B:::c` where `B` is only named, not declared. */
export const USECASE_UNDECLARED_CLASS = 'USECASE_UNDECLARED_CLASS';
/** An element whose metadata cannot be drawn together (an icon with a type, …). */
export const USECASE_INVALID_ELEMENT = 'USECASE_INVALID_ELEMENT';
/** A note attached to something other than an actor or use case. */
export const USECASE_INVALID_NOTE = 'USECASE_INVALID_NOTE';
/** The object of a `json` statement is not valid JSON. */
export const USECASE_INVALID_JSON = 'USECASE_INVALID_JSON';
/** `<<` without `>>` on its line. */
export const USECASE_UNCLOSED_STEREOTYPE = 'USECASE_UNCLOSED_STEREOTYPE';
/** A Markdown text (a quote and a backtick) without its closing backtick and quote. */
export const USECASE_UNCLOSED_MARKDOWN = 'USECASE_UNCLOSED_MARKDOWN';
/** A `json` object without its closing `}`. */
export const USECASE_UNCLOSED_JSON = 'USECASE_UNCLOSED_JSON';
/** A `systemBoundary` without its `end`. */
export const USECASE_UNCLOSED_BOUNDARY = 'USECASE_UNCLOSED_BOUNDARY';
/** An `accDescr {` without its `}`. */
export const USECASE_UNCLOSED_ACC_DESCR = 'USECASE_UNCLOSED_ACC_DESCR';

/** The codes of the model's checks (v12's model builder and its JSON reader). */
export const MODEL_CODES: ReadonlySet<string> = new Set([
  USECASE_CONFLICT,
  USECASE_DUPLICATE_ID,
  USECASE_UNRESOLVED,
  USECASE_INVALID_METADATA,
  USECASE_INVALID_RELATION,
  USECASE_UNDECLARED_CLASS,
  USECASE_INVALID_ELEMENT,
  USECASE_INVALID_NOTE,
  USECASE_INVALID_JSON,
]);
