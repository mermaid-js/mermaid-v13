/**
 * gitGraph hover (DESIGN §4.5, D93): a branch name shows its commits and `order:` (the main
 * branch says its name is set in config), a commit id where it is written shows its branch,
 * message, type, tags and, for a merge, what it merges and its parents; a keyword the one-line
 * doc of the grammar file (`generated/docs.ts`). Only the keyword of a `title`, `accTitle` or
 * `accDescr` line. Nothing on a message, a tag or a number. Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { gitgraphDocs } from '../generated/docs.ts';
import type { GitCommit, GitModel } from '../model.ts';
import type { GitGraphDocument, GitStatementNode, GitValue } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, span, TEXT_WORDS } from './tables.ts';
import { inside } from '@mermaid-js/core/parser-kit';
import { keywordHover } from '@mermaid-js/core/parser-kit';
const plural = (n: number, word: string) =>
  n === 0 ? `no ${word}s` : `${n} ${word}${n === 1 ? '' : 's'}`;
/** Kinds whose docs describe values, not keywords: no hover. */
const NO_DOC = new Set<number>([T.String, T.Reference, T.Int]);

/** The name or id under `offset`: which statement writes it, and as what. */
function nameAt(
  ast: GitGraphDocument,
  offset: number
): { kind: 'branch' | 'commit'; value: GitValue; node: GitStatementNode } | undefined {
  for (const node of ast.children) {
    if (!inside(offset, node.range)) continue;
    const names: [GitValue | undefined, 'branch' | 'commit'][] = [];
    if (node.type === 'Branch') names.push([node.name, 'branch']);
    else if (node.type === 'Checkout') names.push([node.branch, 'branch']);
    else if (node.type === 'Merge') names.push([node.branch, 'branch'], [node.commitId, 'commit']);
    else if (node.type === 'Commit') names.push([node.commitId, 'commit']);
    else if (node.type === 'CherryPick')
      names.push([node.commitId, 'commit'], [node.parent, 'commit']);
    for (const [value, kind] of names)
      if (value && value.value !== '' && inside(offset, value.range)) return { kind, value, node };
  }
  return undefined;
}

function branchHover(name: string, model: GitModel): string {
  const head = `**branch** ${code(name)}`;
  const branch = model.branches.find((b) => b.name === name);
  if (!branch) return `${head}\n\nNo branch of this name is made in this graph.`;
  const commits = model.commits.filter((c) => c.branch === name).length;
  const facts = `${plural(commits, 'commit')} · order: ${branch.order}`;
  if (name !== model.mainBranch) return `${head}\n\n${facts}`;
  const config =
    'The main branch: its name is set in config (`gitGraph.mainBranchName`), so rename it there.';
  return `${head}\n\n${config}\n\n${facts}`;
}

/** What `commit` is; `node` is the statement that made it, when it is in the AST. */
function commitFacts(commit: GitCommit, node: GitStatementNode | undefined): string[] {
  const facts: string[] = [];
  if (commit.type === 'MERGE') {
    if (node?.type === 'Merge') facts.push(`Merge of ${code(node.branch.value)}`);
    if (commit.customType) facts.push(`type: ${commit.customType}`);
  } else {
    if (commit.message !== '') facts.push(`Message: ${code(commit.message)}`);
    if (commit.type !== 'NORMAL') facts.push(`type: ${commit.type}`);
  }
  if (commit.tags.length > 0) facts.push(`tags: ${commit.tags.map(code).join(', ')}`);
  if (commit.type === 'MERGE') facts.push(`parents: ${commit.parents.map(code).join(', ')}`);
  return facts;
}

/** Whether a commit or merge statement before `node` writes `id:"<id>"`. */
function writtenBefore(ast: GitGraphDocument, node: GitStatementNode, id: string): boolean {
  for (const n of ast.children) {
    if (n === node) return false;
    if ((n.type === 'Commit' || n.type === 'Merge') && n.commitId?.value === id) return true;
  }
  return false;
}

function commitHover(
  id: string,
  model: GitModel,
  ast: GitGraphDocument,
  node: GitStatementNode
): string {
  const commit = model.commits.find((c) => c.id === id);
  const head = `**commit** ${code(id)}`;
  if (!commit) return `${head}\n\nNo commit has this id.`;
  if (node.type === 'Merge' && commit.astId !== node.id && writtenBefore(ast, node, id))
    // v12: a merge may not reuse an id; it is rejected (GIT_MERGE_DUPLICATE_ID).
    return `${head}\n\nAn earlier commit has this id, so this merge is rejected and the earlier commit is drawn.`;
  // D264: a later commit with the same id replaced this one.
  if ((node.type === 'Commit' || node.type === 'Merge') && commit.astId !== node.id)
    return `${head}\n\nA later commit takes this id, so this one is not drawn.`;
  const facts = commitFacts(
    commit,
    ast.children.find((n) => n.id === commit.astId)
  );
  const on = `${head} on ${code(commit.branch)}`;
  return facts.length > 0 ? `${on}\n\n${facts.join(' · ')}` : on;
}

export function gitGraphHover(
  at: HoverTarget,
  doc: DocumentView<GitGraphDocument>
): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as GitModel;
  const name = nameAt(result.ast, at.offset);
  if (name) {
    const contents =
      name.kind === 'branch'
        ? branchHover(name.value.value, model)
        : commitHover(name.value.value, model, result.ast, name.node);
    return { range: name.value.range, contents };
  }
  const t = at.token;
  if (!t || NO_DOC.has(t.kind)) return undefined;
  return keywordHover(text, at.offset, t.range, TEXT_WORDS[t.kind], gitgraphDocs[t.kind]);
}
