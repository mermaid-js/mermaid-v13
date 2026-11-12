/**
 * The online half of the allowlist ratchet (#695). The spec (`src/allowlists/allowlists.spec.ts`)
 * is offline and reads issue states from `allowlists/issue-states.json`; this asks GitHub (through
 * `gh`) for the state of every issue an allowlist entry names and compares.
 *
 * - `pnpm --filter \@mermaid-js/conformance allowlist:issues`: exit 1 when the snapshot is stale.
 * - `pnpm --filter \@mermaid-js/conformance allowlist:issues --write`: rewrite the snapshot.
 *
 * After a `--write` that moved an issue to `closed`, the spec fails for each entry that named
 * only that issue, until the entry goes or names an open issue or a decision.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ISSUE_STATES_FILE,
  audit,
  collectAll,
  loadBaseline,
  rulesFor,
} from '../allowlists/allowlists.ts';
import type { IssueStates } from '../allowlists/allowlists.ts';
import { REPO_ROOT } from '../corpus.ts';

const REPO = 'mermaid-js/mermaid-v13';

function stateOf(issue: number): IssueStates[string] {
  try {
    const out = execFileSync('gh', ['api', `repos/${REPO}/issues/${issue}`, '--jq', '.state'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim() === 'open' ? 'open' : 'closed';
  } catch (error) {
    // Not an issue or pull request of this repository. Anything else (no network, no login) stops.
    if (/HTTP 404|HTTP 410/.test(String((error as { stderr?: unknown }).stderr))) return 'unknown';
    throw error;
  }
}

const write = process.argv.includes('--write');
const file = join(REPO_ROOT, ISSUE_STATES_FILE);
const entries = collectAll();
const cited = [...new Set(entries.flatMap((e) => e.issues))].sort((a, b) => a - b);

const live: IssueStates = Object.fromEntries(cited.map((n) => [n, stateOf(n)]));
const committed = JSON.parse(readFileSync(file, 'utf8')) as IssueStates;
const changes = [
  ...cited
    .filter((n) => committed[n] !== live[n])
    .map((n) => `#${n}: ${committed[n] ?? 'not listed'} -> ${live[n]}`),
  ...Object.keys(committed)
    .filter((n) => !(n in live))
    .map((n) => `#${n}: no entry names it any more`),
];
for (const line of changes) process.stdout.write(`${line}\n`);

const stale = changes.length > 0;
if (stale && write) {
  writeFileSync(file, JSON.stringify(live, null, 2) + '\n');
  process.stdout.write(`${ISSUE_STATES_FILE} rewritten (${cited.length} issues)\n`);
}

// Against the live states, so a stale snapshot also shows what it would turn red.
const problems = audit(entries, loadBaseline(), rulesFor(live));
for (const p of problems) process.stdout.write(`${p}\n`);

if (stale && !write) {
  process.stderr.write(
    `${ISSUE_STATES_FILE} is stale: run allowlist:issues --write and commit it\n`
  );
  process.exit(1);
}
if (problems.length > 0) {
  process.stderr.write(
    `${problems.length} allowlist entries need an open issue or a decision id\n`
  );
  process.exit(1);
}
process.stdout.write(`allowlists ok: ${entries.length} entries, ${cited.length} issues cited\n`);
