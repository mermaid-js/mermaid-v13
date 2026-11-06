/**
 * `GitModel` fixtures for the layout specs, each written as gitGraph text and built by the
 * package's parser (`parseGitGraph`), so a spec sees what an author's diagram gives. Ids are
 * written out (`id:`) where a spec names them; the others are derived (D260).
 */
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import type { GitDirection, GitModel } from '../model.ts';
import { parseGitGraph } from '../parser/index.ts';

/**
 * The model of `statements` (gitGraph text without the header) drawn in `direction`. Throws on
 * a parse error, so no fixture is something the parser rejects.
 */
export function git(direction: GitDirection, ...statements: string[]): GitModel {
  const src = [`gitGraph ${direction}:`, ...statements].join('\n');
  const { model, diagnostics } = parseGitGraph(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0)
    throw new Error(`fixture does not parse: ${errors.map((d) => d.code).join(', ')}\n${src}`);
  return model;
}

/** The same model drawn in another direction. */
export const turned = (m: GitModel, direction: GitDirection): GitModel => ({ ...m, direction });

/**
 * v12's in-source `commitPosition` table: main ZERO; feature A, B; merge M (`id:`); release C,
 * two cherry-picks of M and D. A merge is cherry-picked with `parent:` (v12 throws without it,
 * v13 rejects it with `GIT_CHERRY_PICK_MERGE_PARENT`).
 */
export const v12Positions = (direction: GitDirection = 'TB'): GitModel =>
  git(
    direction,
    'commit id:"ZERO"',
    'branch feature',
    'commit id:"A"',
    'commit id:"B"',
    'checkout main',
    'merge feature id:"M"',
    'branch release',
    'commit id:"C"',
    'cherry-pick id:"M" parent:"ZERO"',
    'commit id:"D"',
    'cherry-pick id:"M" parent:"ZERO"'
  );

/** v12's in-source BT parallel table: main 1, 2; develop 3, 4 off 2; feature 5, 6 off 2; main 7, 8. */
export const v12Parallel = (direction: GitDirection = 'BT'): GitModel =>
  git(
    direction,
    'commit id:"1"',
    'commit id:"2"',
    'branch develop',
    'commit id:"3"',
    'commit id:"4"',
    'checkout main',
    'branch feature',
    'commit id:"5"',
    'commit id:"6"',
    'checkout main',
    'commit id:"7"',
    'commit id:"8"'
  );

/** Every kind of commit, tags, merges, a cherry-pick, three lanes and a reroute. */
export function everything(direction: GitDirection = 'LR', title?: string): GitModel {
  return git(
    direction,
    ...(title !== undefined ? [`title ${title}`] : []),
    'commit id:"init" tag:"v0.1" tag:"first"',
    'commit type:HIGHLIGHT',
    'branch develop',
    'commit id:"dev-1"',
    'commit type:REVERSE tag:"rc"',
    'checkout main',
    'commit id:"hotfix"',
    'branch feature/long-branch-name',
    'commit',
    'commit id:"feat-2"',
    'checkout develop',
    'commit id:"dev-3"',
    'checkout main',
    'merge develop id:"m1" tag:"v1.0"',
    'checkout feature/long-branch-name',
    'cherry-pick id:"dev-1"',
    'checkout main',
    'merge feature/long-branch-name',
    'commit id:"tail" type:HIGHLIGHT tag:"v2.0" tag:"latest" tag:"x"'
  );
}

/** Parent graphs with cycles (D264, GAPS.md #370): `A`, `B`, `A` and `S`, `S`. */
export const cycles = (direction: GitDirection = 'LR'): GitModel =>
  git(
    direction,
    'commit id:"A"',
    'commit id:"B"',
    'commit id:"A"',
    'branch side',
    'commit id:"S"',
    'commit id:"S"',
    'checkout main',
    'merge side id:"m"'
  );

/** A branch with no commits, and an empty main. */
export const empty = (direction: GitDirection = 'LR'): GitModel => git(direction, 'branch idle');

/** Every fixture, for the invariant sweeps. */
export const ALL: Readonly<Record<string, (d: GitDirection) => GitModel>> = {
  v12Positions,
  v12Parallel,
  everything,
  titled: (d) => everything(d, 'A long title over the git graph'),
  cycles,
  empty,
};

/**
 * A measurer with round numbers: every character is half the font size wide; ascent 0.8,
 * descent 0.2 and line height 1.25 font sizes.
 */
export const halfEm: Measurer = {
  id: 'half-em',
  width: (text: string, font: FontKey) => (text.length * font.size) / 2,
  metrics: (font: FontKey) => ({
    ascent: font.size * 0.8,
    descent: font.size * 0.2,
    lineHeight: font.size * 1.25,
  }),
};
