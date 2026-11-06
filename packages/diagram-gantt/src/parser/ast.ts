/**
 * Gantt AST (R-PARSE-8, DESIGN §4.2). One node per statement, flat and in source order, as
 * v12's grammar reads them (`gantt.jison` `document`); every node has a semantic id and a range
 * into the original source:
 *
 * | statement                                   | id                                  |
 * | ------------------------------------------- | ----------------------------------- |
 * | a task with id `a`                          | `t:a`, `t:a@2` for the second       |
 * | `section <name>`                            | `s:<name>` (trimmed), `@n` repeats  |
 * | the n-th `click`                            | `click:<n>`                         |
 * | the header, settings, titles, a task whose data is only tags | `st:<n>`           |
 *
 * `st:1` is the header. Texts are as v12's grammar handed them to its DB (see `model.ts`).
 */
import type { AstCallback, AstNode } from '@mermaid-js/core/parser-kit';

/** `gantt`. */
export type GanttHeaderNode = AstNode<'Header'>;

/** The settings, one statement each. */
export type GanttSettingName =
  | 'dateFormat'
  | 'axisFormat'
  | 'tickInterval'
  | 'includes'
  | 'excludes'
  | 'todayMarker'
  | 'inclusiveEndDates'
  | 'topAxis'
  | 'weekday'
  | 'weekend';

/** `dateFormat …`, `excludes …`, `inclusiveEndDates`, `weekday monday`, … */
export interface GanttSettingNode extends AstNode<'Setting'> {
  setting: GanttSettingName;
  /**
   * The value as v12 read it: the text after the keyword and one blank, untrimmed; the day of
   * `weekday`/`weekend`; `''` for `inclusiveEndDates` and `topAxis`.
   */
  value: string;
}

/** `title …`, `accTitle: …`, `accDescr: …` or `accDescr { … }`. */
export interface GanttTextStatementNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  /** The value as v12 stored it: the title untrimmed, the accessibility values trimmed. */
  text: string;
}

/** `section <name>`. */
export interface GanttSectionNode extends AstNode<'Section'> {
  /** The name after `section ` (v12 `substr(8)`), untrimmed. */
  text: string;
}

/** `<text> :<data>`. */
export interface GanttTaskNode extends AstNode<'Task'> {
  /** The task's id (`task<n>` when the data names none); undefined when the data is only tags. */
  task?: string;
  /** The text before `:`, trailing blanks kept. */
  text: string;
  /** The data after `:`, as written. */
  data: string;
}

/** `click <ids> href "<url>"` and/or `call <fn>(<args>)`. */
export interface GanttClickNode extends AstNode<'Click'> {
  /** The task ids, split on `,`. */
  ids: string[];
  href?: string;
  /** `call …`: bound by the interactions plugin (R-SVG-5). */
  callback?: AstCallback;
}

export type GanttStatementNode =
  | GanttHeaderNode
  | GanttSettingNode
  | GanttTextStatementNode
  | GanttSectionNode
  | GanttTaskNode
  | GanttClickNode;

export interface GanttDocument extends AstNode<'Document'> {
  children: GanttStatementNode[];
}
