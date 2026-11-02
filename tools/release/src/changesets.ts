/**
 * Every merge to `mermaid-v13` publishes an alpha (R-REL-2, D28). Changesets only versions
 * packages that have a pending changeset, so a merge without one gets a `mermaid` patch
 * changeset here; in pre mode that becomes the next `13.0.0-alpha.N`.
 *
 * In pre mode changeset files stay in `.changeset/` after `changeset version`; the ones already
 * applied are listed in `pre.json` `changesets`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface PreState {
  mode: 'pre' | 'exit';
  tag: string;
  changesets: string[];
}

const preState = (root: string) =>
  JSON.parse(readFileSync(join(root, '.changeset', 'pre.json'), 'utf8')) as PreState;

export function pendingChangesets(root: string): string[] {
  const consumed = new Set(preState(root).changesets);
  return readdirSync(join(root, '.changeset'))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.slice(0, -3))
    .filter((id) => !consumed.has(id))
    .sort();
}

/** Writes `alpha-<sha12>.md` when nothing is pending; returns its id, or undefined. */
export function ensureChangeset(root: string, sha: string): string | undefined {
  const pre = preState(root);
  if (pre.mode !== 'pre' || pre.tag !== 'alpha')
    throw new Error(
      '.changeset/pre.json is not in pre mode with tag alpha; refusing to add a changeset'
    );
  if (pendingChangesets(root).length > 0) return undefined;
  const short = sha.slice(0, 12);
  const id = `alpha-${short}`;
  writeFileSync(
    join(root, '.changeset', `${id}.md`),
    `---\n'mermaid': patch\n---\n\nchore: alpha build of ${short}\n`
  );
  return id;
}
