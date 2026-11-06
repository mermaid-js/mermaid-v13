/**
 * gitGraph AST (R-PARSE-8, DESIGN §4.2 adapted, spec #292 "AST ids"). Every statement that
 * parsed has a node with a semantic id and a range into the original source, from its keyword
 * (leading blanks off) to its last token. A statement with a syntax error has none; one with a
 * semantic error (an unknown branch, …) has its node but changed nothing in the model.
 *
 * | statement                         | id                                         |
 * | --------------------------------- | ------------------------------------------ |
 * | `commit id:"A"`                   | `c:A`, a repeat of the id `c:A@2`, …       |
 * | `commit` without an `id:`         | `c#<k>`, the k-th such commit (from 1)     |
 * | `merge dev`                       | `m:dev#<k>`, the k-th merge of `dev`       |
 * | `cherry-pick id:"A"`              | `cp:A#<k>`, the k-th cherry-pick of `A`    |
 * | `branch dev`                      | `b:dev`, a repeat `b:dev@2`, …             |
 * | `checkout dev` / `switch dev`     | `co:dev#<k>`, the k-th checkout of `dev`   |
 * | header, `title`, `accTitle`, `accDescr` | `st:<k>`, the k-th such line         |
 *
 * In names `%`, `>`, `@`, `#` and the characters XML 1.0 cannot hold are percent-encoded
 * (`%25`, `%3E`, `%40`, `%23`, `%00`, …), so the suffixes stay unambiguous and `data-ast` is the
 * id. Values are as written (D263), after string conversion.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { GitDirection, GitWrittenType } from '../model.ts';

/** A name or string value and where it is (quotes included). */
export interface GitValue {
  value: string;
  range: Range;
}

/** `gitGraph`, `gitGraph:`, `gitGraph LR:` …; `direction` only when written. */
export interface GitHeaderNode extends AstNode<'Header'> {
  direction?: GitDirection;
}

/** `commit` and its options; for a repeated option the last one (tags: all, in order). */
export interface GitCommitNode extends AstNode<'Commit'> {
  commitId?: GitValue;
  message?: GitValue;
  tags: GitValue[];
  commitType?: GitWrittenType;
}

/** `branch <name> [order: n]`. */
export interface GitBranchNode extends AstNode<'Branch'> {
  name: GitValue;
  order?: number;
}

/** `merge <branch>` and its options. */
export interface GitMergeNode extends AstNode<'Merge'> {
  branch: GitValue;
  commitId?: GitValue;
  tags: GitValue[];
  commitType?: GitWrittenType;
}

/** `checkout <branch>` or `switch <branch>`. */
export interface GitCheckoutNode extends AstNode<'Checkout'> {
  keyword: 'checkout' | 'switch';
  branch: GitValue;
}

/** `cherry-pick` and its options. */
export interface GitCherryPickNode extends AstNode<'CherryPick'> {
  commitId?: GitValue;
  parent?: GitValue;
  tags: GitValue[];
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface GitTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type GitStatementNode =
  | GitHeaderNode
  | GitCommitNode
  | GitBranchNode
  | GitMergeNode
  | GitCheckoutNode
  | GitCherryPickNode
  | GitTextNode;

export interface GitGraphDocument extends AstNode<'Document'> {
  children: GitStatementNode[];
}
