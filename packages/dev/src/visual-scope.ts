/**
 * Which fixtures a PR's visual job photographs (D631). The job renders every fixture to SVG in
 * Node on the PR and on its base (`cli/visual-hashes.ts`) and photographs only those whose SVG
 * differs: with the table measurer the browser draws the same bytes (the node-browser spec in
 * `e2e/browser`), so an unchanged SVG is an unchanged screenshot. Paths decide only
 * what that comparison cannot see (the page, the harness) and what needs no comparison at all.
 * Pure: the git and file work is in `cli/visual-scope.ts`.
 */

/** `full`: every fixture. `compare`: hash both sides. `skip`: nothing can have changed. */
export interface PathVerdict {
  readonly kind: 'full' | 'compare' | 'skip';
  readonly reason: string;
}

/**
 * Code the Node comparison cannot see, because it only runs in the browser or decides how a
 * screenshot is taken: the page server and browser adapter, the snapshot spec and its helpers,
 * the Playwright setup, the DOM adapter, and the workflows and scripts of the job itself.
 */
const BROWSER_SIDE: readonly RegExp[] = [
  /^packages\/dev\/(?!.*\.spec\.ts$)/,
  /^e2e\/helpers\/(?!.*\.spec\.ts$)/,
  /^e2e\/rendering\/mmd-snapshots\.spec\.ts$/,
  /^playwright\.config\.ts$/,
  /^package\.json$/,
  /^packages\/mermaid\/src\/dom/,
  /^\.github\/workflows\/(ci|visual-nightly)\.yml$/,
  /^\.github\/scripts\//,
];

/** Files no screenshot depends on: prose, tests, and packages the render never imports. */
const NEVER_RENDERED: readonly RegExp[] = [
  /\.md$/,
  /^(docs|v13\/docs|\.changeset|dev-diagrams|tools)\//,
  /\.spec\.ts$/,
  /^packages\/(bench|conformance|bundler-plugin|language-[^/]+)\//,
];

const matches = (patterns: readonly RegExp[], file: string): boolean =>
  patterns.some((pattern) => pattern.test(file));

/** What the changed files alone say. An empty list is `compare`: nothing is known. */
export function classifyPaths(files: readonly string[]): PathVerdict {
  const browserSide = files.filter((file) => matches(BROWSER_SIDE, file));
  if (browserSide.length > 0) {
    return { kind: 'full', reason: `browser-side or harness code changed: ${browserSide[0]}` };
  }
  if (files.length > 0 && files.every((file) => matches(NEVER_RENDERED, file))) {
    return { kind: 'skip', reason: 'only docs, tests or packages the render does not use' };
  }
  return { kind: 'compare', reason: 'rendering code may have changed' };
}

export type Hashes = Readonly<Record<string, string>>;

/** Fixtures of `head` whose hash is new or differs from `base`, sorted. Removed ones are left out. */
export function changedFixtures(base: Hashes, head: Hashes): string[] {
  return Object.keys(head)
    .filter((fixture) => base[fixture] !== head[fixture])
    .sort();
}

export interface Decision {
  /** `full`: every fixture of the tiers. `subset`: only `photograph`. `skip`: none. */
  readonly mode: 'full' | 'subset' | 'skip';
  readonly reason: string;
  /** Changed fixtures in the tiers this run photographs (mode `subset`). */
  readonly photograph: readonly string[];
  /** Changed fixtures in the other tiers: the nightly run photographs them. */
  readonly nightly: readonly string[];
}

const tierOf = (fixture: string): string => fixture.split('/')[1] ?? '';

/** The decision for a compared PR: `changed` split by whether this run photographs the tier. */
export function decideFromHashes(changed: readonly string[], tiers: readonly string[]): Decision {
  const photograph = changed.filter((fixture) => tiers.includes(tierOf(fixture)));
  const nightly = changed.filter((fixture) => !tiers.includes(tierOf(fixture)));
  if (photograph.length === 0) {
    return {
      mode: 'skip',
      reason: 'no fixture of these tiers renders differently',
      photograph,
      nightly,
    };
  }
  return {
    mode: 'subset',
    reason: `${photograph.length} fixtures render differently`,
    photograph,
    nightly,
  };
}

const full = (reason: string): Decision => ({ mode: 'full', reason, photograph: [], nightly: [] });

/** The decision that needs no comparison, or undefined when the hashes must decide. */
export function decideWithoutHashes(input: {
  readonly event: string;
  readonly forceFull: boolean;
  readonly files: readonly string[];
}): Decision | undefined {
  if (input.event !== 'pull_request') {
    return full(`a ${input.event} run photographs everything (the baseline)`);
  }
  if (input.forceFull) return full('the PR has the `visual: full` label');
  const verdict = classifyPaths(input.files);
  if (verdict.kind === 'full') return full(verdict.reason);
  if (verdict.kind === 'skip') {
    return { mode: 'skip', reason: verdict.reason, photograph: [], nightly: [] };
  }
  return undefined;
}

/** The fail-safe: when the comparison itself breaks, photograph everything. */
export const fullAfterFailure = (error: unknown): Decision =>
  full(`the comparison failed (${error instanceof Error ? error.message : String(error)})`);

const byFolder = (fixtures: readonly string[]): string => {
  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    const folder = fixture.split('/')[0] ?? '';
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, count]) => `${folder} ${count}`)
    .join(', ');
};

/** How many fixture paths the summary lists before it says "and N more". */
const LISTED = 40;

const listing = (fixtures: readonly string[]): string[] => [
  ...fixtures.slice(0, LISTED).map((fixture) => `- \`${fixture}\``),
  ...(fixtures.length > LISTED ? [`- and ${fixtures.length - LISTED} more`] : []),
];

/** The job summary (Markdown): the mode, why, and what changed where. */
export function summarize(decision: Decision): string {
  const lines = [`### Visual scope: ${decision.mode}`, '', decision.reason];
  if (decision.photograph.length > 0) {
    lines.push('', `**Photographed (${byFolder(decision.photograph)}):**`, '');
    lines.push(...listing(decision.photograph));
  }
  if (decision.nightly.length > 0) {
    lines.push(
      '',
      `**Also changed, in tiers only the nightly photographs (${byFolder(decision.nightly)}):**`,
      ''
    );
    lines.push(...listing(decision.nightly));
  }
  return `${lines.join('\n')}\n`;
}

export interface Replay {
  readonly total: number;
  readonly full: number;
  readonly compare: number;
  readonly skip: number;
  /** The first file that forced a full run, by how many PRs it did so in; most frequent first. */
  readonly fullBecause: readonly (readonly [file: string, prs: number])[];
}

/** What the path rules alone decide for each of `prs` (their changed files): the retro's numbers. */
export function replayPaths(prs: readonly (readonly string[])[]): Replay {
  const counts = { full: 0, compare: 0, skip: 0 };
  const because = new Map<string, number>();
  for (const files of prs) {
    const verdict = classifyPaths(files);
    counts[verdict.kind] += 1;
    if (verdict.kind === 'full') {
      const file = verdict.reason.slice(verdict.reason.indexOf(': ') + 2);
      because.set(file, (because.get(file) ?? 0) + 1);
    }
  }
  const fullBecause = [...because].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return { total: prs.length, ...counts, fullBecause };
}
