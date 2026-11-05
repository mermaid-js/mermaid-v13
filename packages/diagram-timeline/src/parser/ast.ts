/**
 * Timeline AST (R-PARSE-8, DESIGN §4.2). One node per statement, flat and in source order, as
 * v12's grammar reads them (`timeline.jison` `document`); every node has a semantic id and a
 * range into the original source:
 *
 * | statement                                        | id            |
 * | ------------------------------------------------ | ------------- |
 * | the n-th `section`                               | `sec:<n>`     |
 * | the n-th time period                             | `per:<n>`     |
 * | the k-th event of period `per:<p>`               | `ev:<p>.<k>`  |
 * | the header, `title`, `accTitle`, `accDescr`, and an event with no period before it | `st:<n>` |
 *
 * `st:1` is the header. Ordinals are 1-based. Text is as v12's grammar handed it to its DB
 * (untrimmed; see `model.ts`).
 */
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { TimelineDirection } from '../model.ts';

/** `timeline`, `timeline LR` or `timeline TD`. */
export interface TimelineHeaderNode extends AstNode<'Header'> {
  direction: TimelineDirection;
}

/** `title …`, `accTitle: …`, `accDescr: …` or `accDescr { … }`. */
export interface TimelineTextStatementNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  /** The value as v12 stored it: the title untrimmed, the accessibility values trimmed. */
  text: string;
}

/** `section <name>`. */
export interface TimelineSectionNode extends AstNode<'Section'> {
  /** The name after `section ` (v12 `substr(8)`), untrimmed. */
  text: string;
}

/** A time period: the text before its first `:` (v12 `period`). */
export interface TimelinePeriodNode extends AstNode<'Period'> {
  /** As written, trailing blanks kept. */
  text: string;
}

/** `: <event>`, on a period's line or on a line of its own. */
export interface TimelineEventNode extends AstNode<'Event'> {
  /** The text after `: ` (v12 `substr(2)`), untrimmed. */
  text: string;
  /** Index into `TimelineModel.periods` of the period it belongs to; none before any period. */
  period?: number;
}

export type TimelineStatementNode =
  | TimelineHeaderNode
  | TimelineTextStatementNode
  | TimelineSectionNode
  | TimelinePeriodNode
  | TimelineEventNode;

export interface TimelineDocument extends AstNode<'Document'> {
  children: TimelineStatementNode[];
}
