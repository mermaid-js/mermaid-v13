/**
 * The Compare tab's pure state (#61; v12 `compare-versions.ts`): semver order, the version the
 * right pane loads (`12` = the newest `mermaid@12`, `latest`, or an exact version), its CDN
 * bundle, the URL state, and the config an npm version renders with. DOM-free: the versions
 * proxy (`src/versions.ts`) uses it too.
 */

const CDN = 'https://cdn.jsdelivr.net/npm';

/** What `GET /dev/api/versions` answers. */
export interface VersionsResponse {
  readonly mermaid: {
    /** Every published semver version, newest first (prereleases included). */
    readonly versions: readonly string[];
    readonly distTags: Readonly<Record<string, string>>;
  };
  /** When the registry was last read (ms since the epoch). */
  readonly fetchedAt: number;
  /** The registry could not be reached; this is the last good answer. */
  readonly stale: boolean;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([\d.A-Za-z-]+))?$/;

interface Semver {
  readonly core: readonly [number, number, number];
  readonly pre: readonly string[];
}

function parse(v: string): Semver | undefined {
  const m = SEMVER.exec(v);
  return m
    ? { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] }
    : undefined;
}

export const isSemver = (v: string): boolean => parse(v) !== undefined;
export const isPrerelease = (v: string): boolean => (parse(v)?.pre.length ?? 0) > 0;

function comparePre(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an !== bn) return an ? -1 : 1;
  return Number(a > b) - Number(a < b);
}

/** Semver precedence; invalid versions sort below everything. */
export function compareSemver(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return Number(!!pa) - Number(!!pb);
  const core = pa.core.map((n, i) => n - (pb.core[i] ?? 0)).find((d) => d !== 0);
  if (core !== undefined) return core;
  if (pa.pre.length === 0 || pb.pre.length === 0) return pb.pre.length - pa.pre.length;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = comparePre(x, y);
    if (c !== 0) return c;
  }
  return 0;
}

/** Semver versions only, newest first. */
export const sortVersionsDesc = (versions: Iterable<string>): string[] =>
  [...versions].filter(isSemver).sort((a, b) => compareSemver(b, a));

// ---------------------------------------------------------------------------
// The right pane's version
// ---------------------------------------------------------------------------

/** The v12 line: the newest stable `mermaid@12.x`. The default. */
export const V12_LINE = '12';
export const DEFAULT_VERSION = V12_LINE;

/** `12` (the v12 line), `latest` or an exact version. */
export const isVersionChoice = (v: string | null | undefined): v is string =>
  v === V12_LINE || v === 'latest' || (typeof v === 'string' && isSemver(v));

/**
 * The exact version a choice loads: an exact version as is; `latest` from the dist-tags; `12`
 * the newest stable 12.x. `undefined` while the list is missing (offline) for an alias.
 */
export function resolveVersion(
  choice: string,
  versions: VersionsResponse | undefined
): string | undefined {
  if (isSemver(choice)) return choice;
  if (!versions) return undefined;
  if (choice === 'latest') return versions.mermaid.distTags.latest;
  if (choice === V12_LINE) {
    return versions.mermaid.versions.find((v) => !isPrerelease(v) && v.startsWith('12.'));
  }
  return undefined;
}

/** The ESM bundle of a published mermaid ≥ 10 (v12's `describeBundle`, ESM era only). */
export const cdnBundleUrl = (version: string): string =>
  `${CDN}/mermaid@${version}/dist/mermaid.esm.min.mjs`;

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

export interface CompareUrlState {
  /** `12`, `latest` or an exact version. */
  readonly version: string;
  readonly diff: boolean;
}

/** From `?version=&diff=1`; anything else is the default. */
export function parseCompareUrlState(params: URLSearchParams): CompareUrlState {
  const version = params.get('version');
  const diff = params.get('diff');
  return {
    version: isVersionChoice(version) ? version : DEFAULT_VERSION,
    diff: diff === '1' || diff === 'true',
  };
}

/** For `setUrlParams` (`null` removes a param; the defaults stay out of the URL). */
export function serializeCompareUrlState(
  state: CompareUrlState
): Record<'version' | 'diff', string | null> {
  return {
    version: state.version === DEFAULT_VERSION ? null : state.version,
    diff: state.diff ? '1' : null,
  };
}

// ---------------------------------------------------------------------------
// Render config
// ---------------------------------------------------------------------------

/** v13 layout names → the published mermaid's (v13's `layered` is v12's `dagre`). */
const NPM_LAYOUTS: Readonly<Record<string, string>> = { layered: 'dagre' };

/**
 * The `initialize()` config a published mermaid renders with, for the v13 settings: the same
 * theme (`auto` → `dark` or `default` by the colour scheme) and layout (mapped), unset keys
 * left out, every diagram at its natural size so both panes overlay pixel for pixel.
 */
export function npmRenderConfig(
  settings: { readonly theme?: string; readonly layout?: string },
  prefersDark: boolean
): Record<string, unknown> {
  const autoTheme = prefersDark ? 'dark' : 'default';
  const theme = settings.theme === 'auto' ? autoTheme : settings.theme;
  const layout = settings.layout ? (NPM_LAYOUTS[settings.layout] ?? settings.layout) : undefined;
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    ...(theme ? { theme } : {}),
    ...(layout ? { layout } : {}),
    flowchart: { useMaxWidth: false },
  };
}
