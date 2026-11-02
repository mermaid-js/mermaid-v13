import { globby } from 'globby';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { load } from 'js-yaml';
import { FIRST_PARTY } from '../../packages/mermaid/src/generated/registry.gen.ts';

export const DIAGRAMS_DIR = 'e2e/diagrams';

/**
 * Free-form, test-tooling-only metadata read out of a fixture's own mermaid
 * frontmatter, alongside mermaid's own recognized keys (`config`/`title`/
 * `displayMode`, which the renderer consumes and this reader ignores).
 * `description` and `tags` are the two fields the runner currently does
 * anything with, but authors can add others (e.g. `relatedIssue`,
 * `coveredShapes`) for humans reading the file.
 */
export interface FixtureMetadata {
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

export const fixturePath = (relativePath: string, diagramsDir = DIAGRAMS_DIR): string =>
  join(diagramsDir, relativePath);

// Mirrors packages/mermaid/src/diagram-api/regexes.ts frontMatterRegex. Kept
// independent so this test helper doesn't reach into the mermaid package,
// but must stay in sync with it.
const FRONT_MATTER_RE = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;

/**
 * Reads a fixture's own YAML frontmatter, if it has one, and pulls out the
 * test-tooling fields (`description`, `tags`). Returns `undefined` when the
 * fixture has no frontmatter, or its frontmatter carries neither field (e.g.
 * a fixture whose frontmatter only sets mermaid `config`) — that is the
 * expected, unremarkable case for many fixtures, not an error. Frontmatter
 * that isn't a YAML mapping throws rather than being silently ignored, since
 * that means someone got the file wrong and would want to know.
 */
export const readFixtureMetadata = (
  relativePath: string,
  diagramsDir = DIAGRAMS_DIR
): FixtureMetadata | undefined => {
  const path = fixturePath(relativePath, diagramsDir);
  const match = FRONT_MATTER_RE.exec(readFileSync(path, 'utf8'));
  if (!match) {
    return undefined;
  }

  const indent = match[1];
  const yamlBody = indent
    ? match[2]
        .split('\n')
        .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
        .join('\n')
    : match[2];

  const parsed: unknown = load(yamlBody);
  if (parsed === null || parsed === undefined) {
    return undefined;
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Frontmatter at ${path} must be a YAML mapping, got: ${JSON.stringify(parsed)}`
    );
  }

  const { description, tags } = parsed as FixtureMetadata;
  if (description === undefined && tags === undefined) {
    return undefined;
  }
  return { description, tags };
};

export interface FixtureTree {
  fixtures: string[];
  children: Map<string, FixtureTree>;
}

export const fixtureBaseName = (relativePath: string): string =>
  basename(relativePath).replace(/\.mmd$/i, '');

export const buildFixtureTree = (relativePaths: readonly string[]): FixtureTree => {
  const root: FixtureTree = { fixtures: [], children: new Map() };

  for (const relativePath of relativePaths) {
    const segments = relativePath.split('/');
    const fileName = segments.pop();
    if (!fileName) {
      continue;
    }

    let node = root;
    for (const segment of segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = { fixtures: [], children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.fixtures.push(relativePath);
  }

  return root;
};

export const collectMmdFixtures = async (
  diagramsDir = DIAGRAMS_DIR,
  pattern: string | string[] = '**/*.mmd'
): Promise<string[]> => {
  return globby(pattern, { cwd: diagramsDir, onlyFiles: true });
};

/**
 * Mirrors the snapshot-name flattening in helpers/util.ts: the screenshot name
 * is the test's title path (folder segments + base name) with every run of
 * non `[\w.-]` characters — including the `/` folder separators — collapsed to
 * `-`. So `a/b/c` and `a/b-c` flatten to the same name. Used to detect fixtures
 * that would share a baseline.
 */
export const snapshotNameKey = (relativePath: string): string =>
  relativePath.replace(/\.mmd$/i, '').replace(/[^\w.-]+/g, '-');

/**
 * Throws if two fixtures collapse to the same snapshot name — otherwise they
 * would write/compare the same screenshot and one would silently mask the
 * other (and churn the Argos baseline). Called once at test registration.
 */
export const assertUniqueSnapshotNames = (relativePaths: readonly string[]): void => {
  const byKey = new Map<string, string[]>();
  for (const relativePath of relativePaths) {
    const key = snapshotNameKey(relativePath);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(relativePath);
    } else {
      byKey.set(key, [relativePath]);
    }
  }
  const collisions = [...byKey.values()].filter((paths) => paths.length > 1);
  if (collisions.length > 0) {
    throw new Error(
      'mmd fixtures collapse to the same snapshot name (one would mask another):\n' +
        collisions.map((paths) => `  ${paths.join('  ==  ')}`).join('\n')
    );
  }
};

/**
 * The v12 diagram types (as `detectType` reports them) that each top-level fixture folder
 * holds. A folder runs only when every type it lists has a v13 package. The spec checks this
 * table against `detectType` over every fixture, so a new folder or a stray type fails there.
 */
export const FIXTURE_FOLDER_TYPES: Readonly<Record<string, readonly string[]>> = {
  agentflow: ['agentflow'],
  architecture: ['architecture'],
  block: ['block'],
  c4: ['c4'],
  'class-diagram': ['classDiagram'],
  'conf-and-directives': ['flowchart-v2'],
  cynefin: ['cynefin'],
  'er-diagram': ['er'],
  eventmodeling: ['eventmodeling'],
  flowchart: ['flowchart-v2'],
  gantt: ['gantt'],
  git: ['gitGraph'],
  info: ['info'],
  ishikawa: ['ishikawa'],
  journey: ['journey'],
  kanban: ['kanban'],
  katex: ['flowchart-v2'],
  mindmap: ['mindmap'],
  packet: ['packet'],
  pie: ['pie'],
  'quadrant-chart': ['quadrantChart'],
  radar: ['radar'],
  railroad: ['railroad', 'railroadEbnf', 'railroadAbnf', 'railroadPeg'],
  requirement: ['requirement'],
  sankey: ['sankey'],
  sequence: ['sequence'],
  'state-diagram': ['stateDiagram'],
  // One fixture here is an `info` diagram.
  'state-diagram-v2': ['stateDiagram', 'info'],
  swimlanes: ['swimlane'],
  timeline: ['timeline'],
  'tree-view': ['treeView'],
  treemap: ['treemap'],
  usecase: ['usecase'],
  venn: ['venn'],
  wardley: ['wardley'],
  xychart: ['xychart'],
  // An external plugin in v12; not in the first-party registry.
  zenuml: ['zenuml'],
};

/** The diagram types that have a v13 package: registry rows with a `load`. */
export const SUPPORTED_TYPES: ReadonlySet<string> = new Set(
  FIRST_PARTY.filter((entry) => entry.load).map((entry) => entry.type)
);

export interface DiscoveryOptions {
  diagramsDir?: string;
  /** Comma-separated tier folders (`MERMAID_E2E_FIXTURE_TIER`). Unset or empty means all. */
  tiers?: string;
  supportedTypes?: ReadonlySet<string>;
  folderTypes?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The top-level fixture folders whose diagram types all have a v13 package, sorted. Throws on
 * a folder missing from `folderTypes`. The dev explorer lists these same folders.
 */
export const supportedFixtureFolders = ({
  diagramsDir = DIAGRAMS_DIR,
  supportedTypes = SUPPORTED_TYPES,
  folderTypes = FIXTURE_FOLDER_TYPES,
}: Omit<DiscoveryOptions, 'tiers'> = {}): string[] => {
  const folders = readdirSync(diagramsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const undeclared = folders.filter((folder) => !Object.hasOwn(folderTypes, folder));
  if (undeclared.length > 0) {
    throw new Error(
      `Fixture folders with no entry in FIXTURE_FOLDER_TYPES (e2e/helpers/mmd-snapshots.ts): ${undeclared.join(', ')}`
    );
  }
  return folders.filter((folder) => folderTypes[folder]!.every((type) => supportedTypes.has(type)));
};

/**
 * The fixtures the snapshot run renders, as paths relative to `diagramsDir`, sorted: every
 * tier of every supported folder (as v12 develop collects them), narrowed by `tiers`.
 */
export const discoverMmdFixtures = async (options: DiscoveryOptions = {}): Promise<string[]> => {
  const { diagramsDir = DIAGRAMS_DIR, tiers } = options;
  const tierList = (tiers ?? '')
    .split(',')
    .map((tier) => tier.trim())
    .filter(Boolean);
  const below = tierList.length > 0 ? tierList.map((tier) => `${tier}/**/*.mmd`) : ['**/*.mmd'];
  const patterns = supportedFixtureFolders(options).flatMap((folder) =>
    below.map((pattern) => `${folder}/${pattern}`)
  );
  if (patterns.length === 0) return [];
  return (await collectMmdFixtures(diagramsDir, patterns)).sort();
};
