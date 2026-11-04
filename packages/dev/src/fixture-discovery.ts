/**
 * Which e2e fixtures run (#63): the top-level folders under `e2e/diagrams` whose diagram types
 * all have a v13 package, and the `.mmd` files below them. The snapshot run
 * (`e2e/helpers/mmd-snapshots.ts` re-exports this) and the dev explorer's folder list both
 * read it, so they can't drift apart.
 */
import { readdirSync } from 'node:fs';
import { globby } from 'globby';

/** Relative to the working directory: the checkout root, where Playwright and vitest run. */
export const DIAGRAMS_DIR = 'e2e/diagrams';

export const collectMmdFixtures = async (
  diagramsDir = DIAGRAMS_DIR,
  pattern: string | string[] = '**/*.mmd'
): Promise<string[]> => {
  return globby(pattern, { cwd: diagramsDir, onlyFiles: true });
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
  // Its one `info` fixture is in FIXTURE_TYPE_EXCEPTIONS.
  'state-diagram-v2': ['stateDiagram'],
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

/**
 * Fixtures of another type than their folder's (fixture path → type): each runs only once its
 * own type has a v13 package, so it does not hold back its folder.
 */
export const FIXTURE_TYPE_EXCEPTIONS: Readonly<Record<string, string>> = {
  'state-diagram-v2/nightly-check/v2-should-render-a-simple-info.mmd': 'info',
};

export interface DiscoveryOptions {
  diagramsDir?: string;
  /** Comma-separated tier folders (`MERMAID_E2E_FIXTURE_TIER`). Unset or empty means all. */
  tiers?: string;
  /**
   * The diagram types that have a v13 package. The caller passes it: the e2e helper reads the
   * registry source, the dev server asks mermaid (`supportsFormat`), since Playwright resolves
   * workspace packages without the `mermaid-source` condition.
   */
  supportedTypes: ReadonlySet<string>;
  folderTypes?: Readonly<Record<string, readonly string[]>>;
  typeExceptions?: Readonly<Record<string, string>>;
}

/**
 * The top-level fixture folders whose diagram types all have a v13 package, sorted. Throws on
 * a folder missing from `folderTypes`. The dev explorer lists these same folders.
 */
export const supportedFixtureFolders = ({
  diagramsDir = DIAGRAMS_DIR,
  supportedTypes,
  folderTypes = FIXTURE_FOLDER_TYPES,
}: Omit<DiscoveryOptions, 'tiers'>): string[] => {
  const folders = readdirSync(diagramsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const undeclared = folders.filter((folder) => !Object.hasOwn(folderTypes, folder));
  if (undeclared.length > 0) {
    throw new Error(
      `Fixture folders with no entry in FIXTURE_FOLDER_TYPES (packages/dev/src/fixture-discovery.ts): ${undeclared.join(', ')}`
    );
  }
  return folders.filter((folder) => folderTypes[folder]!.every((type) => supportedTypes.has(type)));
};

/**
 * The fixtures the snapshot run renders, as paths relative to `diagramsDir`, sorted: every
 * tier of every supported folder (as v12 develop collects them), narrowed by `tiers`.
 */
export const discoverMmdFixtures = async (options: DiscoveryOptions): Promise<string[]> => {
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
  const { supportedTypes, typeExceptions = FIXTURE_TYPE_EXCEPTIONS } = options;
  return (await collectMmdFixtures(diagramsDir, patterns))
    .filter((file) => {
      const type = typeExceptions[file];
      return type === undefined || supportedTypes.has(type);
    })
    .sort();
};

/** The fixture folders' diagram types that `supports` (e.g. mermaid's `supportsFormat`) renders. */
export const supportedTypesOf = (supports: (type: string) => boolean): ReadonlySet<string> =>
  new Set(
    [
      ...Object.values(FIXTURE_FOLDER_TYPES).flat(),
      ...Object.values(FIXTURE_TYPE_EXCEPTIONS),
    ].filter(supports)
  );
