/**
 * What the block parser accepts at its decision points, for the probe (R-LANG-7, D95): the
 * kinds it tests there. Constants, so a parse without a probe allocates nothing for them.
 */
import { kindSet } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/** What may start a statement. */
export const STATEMENT_KINDS = [
  T.NodeId,
  T.Columns,
  T.SpaceBlock,
  T.IdBlock,
  T.Block,
  T.ClassDef,
  T.Class,
  T.Style,
];
/** What may start a statement in a composite's body, or close it. */
export const BODY_KINDS = [...STATEMENT_KINDS, T.End];
/** What may follow a block's id. */
export const SHAPE_KINDS = [T.NodeDStart, T.BlockArrowStart];
/** What may follow the first block of a statement (its shape, if any). */
export const SIZE_KINDS = [T.Size];
/** What may follow a block in a chain. */
export const LINK_KINDS = [T.Link, T.StartLink];
/** What may hold a shape's or block arrow's label: a string or a markdown string (D736). */
export const LABEL_KINDS = [T.Str, T.MdStr];
/** What may follow an edge's `--`: the label's quote, or a markdown string (D736). */
export const EDGE_LABEL_KINDS = [T.LinkLabel, T.MdStr];
export const DIR_KINDS = [T.Dir];
export const DIR_OR_CLOSE_KINDS = [T.Dir, T.BlockArrowEnd];

/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset: the
 * shape and block-arrow delimiters, links, a label's quote, `block:` and a span's `:`.
 */
export const PROBE_FOLLOWS = kindSet(
  T.NodeDStart,
  T.NodeDEnd,
  T.BlockArrowStart,
  T.ArrowDirStart,
  T.BlockArrowEnd,
  T.Link,
  T.StartLink,
  T.LinkLabel,
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd,
  T.IdBlock
);
