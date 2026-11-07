/**
 * The v13 side of gitGraph parity: the gitGraph parser and the normaliser from its `GitModel` to
 * the {@link GitSnapshot} that `v12.ts` takes from mermaid\@12's gitGraph DB.
 *
 * One listed divergence is applied here rather than in `divergences.json` (D263): v12's DB ran
 * `sanitizeText` on every id, message, tag, branch name and title, which (with no
 * `securityLevel`) turns `<`, `>` and `=` into `&lt;`, `&gt;`, `&equals;` and `<br>` into
 * `<br/>`. v13 keeps the text as written, so {@link sanitizeLikeV12} applies the same
 * replacements to the v13 side before the comparison.
 */
import { detectGitGraph, parseGitGraph } from '@mermaid-js/diagram-gitgraph';
import type { GitCommitType, GitModel } from '@mermaid-js/diagram-gitgraph';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { byName, GITGRAPH_V12_TYPES, gitGraphV12Snapshot, normaliseIds } from './v12.ts';
import type { GitCommitSnapshot, GitSnapshot } from './v12.ts';

const TYPE_CODE: Readonly<Record<GitCommitType, number>> = {
  NORMAL: 0,
  REVERSE: 1,
  HIGHLIGHT: 2,
  MERGE: 3,
  CHERRY_PICK: 4,
};

/**
 * v12's `sanitizeText` without a `securityLevel` (`common.ts` `sanitizeMore`, DOMPurify stubbed
 * by the oracle): line breaks to a placeholder, `<` `>` `=` escaped, placeholders back as
 * `<br/>` (D263).
 */
export function sanitizeLikeV12(text: string): string {
  return text
    .replace(/<\/?br\s*\/?>/gi, '#br#')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/=/g, '&equals;')
    .replace(/#br#/g, '<br/>');
}

export function gitGraphV13Snapshot(model: GitModel): GitSnapshot {
  const s = sanitizeLikeV12;
  const commits = model.commits.map((c): GitCommitSnapshot => {
    const out: GitCommitSnapshot = {
      id: s(c.id),
      message: s(c.message),
      seq: c.seq,
      type: TYPE_CODE[c.type],
      tags: c.tags.map(s),
      parents: c.parents.map(s),
      branch: s(c.branch),
    };
    if (c.customType) out.customType = TYPE_CODE[c.customType];
    if (c.type === 'MERGE') out.customId = c.customId;
    return out;
  });
  return normaliseIds({
    direction: model.direction,
    commits,
    branches: model.branches.map((b) => s(b.name)),
    heads: model.branches
      .map((b): [string, string | null] => [s(b.name), b.head === null ? null : s(b.head)])
      .sort(byName),
    currentBranch: s(model.currentBranch),
    head: model.head === null ? null : s(model.head),
    title: s(model.title ?? ''),
    accTitle: s(model.accTitle),
    accDescr: s(model.accDescr),
  });
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, and the config is the default, as the oracle gives v12
 * neither (see `v12.ts`); `config-parity.spec.ts` covers `mainBranchName`/`mainBranchOrder`.
 */
export function parseGitGraphForParity(text: string, config: GitParityConfig = {}): GitModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseGitGraph(text, { ...config, preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export interface GitParityConfig {
  mainBranchName?: string;
  mainBranchOrder?: number;
}

export const gitGraphAdapter: DiagramAdapter<GitModel> = {
  id: 'gitGraph',
  v12Types: GITGRAPH_V12_TYPES,
  detect: (text) => detectGitGraph(text),
  parse: (text) => parseGitGraphForParity(text),
  normaliseV13: gitGraphV13Snapshot,
  normaliseV12: gitGraphV12Snapshot,
};
