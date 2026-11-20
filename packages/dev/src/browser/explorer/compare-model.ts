/**
 * The Compare tab's pure state (#61; v12 `compare-versions.ts`): semver order, the version the
 * right pane loads (`12` = the newest `mermaid@12`, `latest`, or an exact version), its CDN
 * bundle, the URL state, and the config an npm version renders with. DOM-free: the versions
 * proxy (`src/versions.ts`) uses it too.
 */
import { LOCAL_LIMITS } from './settings.ts';

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
 * left out, every diagram at its natural size so both panes overlay pixel for pixel, and the
 * size limits lifted like the dev pane's (`LOCAL_LIMITS`, in v12's terms).
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
    maxTextSize: LOCAL_LIMITS.maxSourceLength,
    maxEdges: LOCAL_LIMITS.maxEdges,
    ...(theme ? { theme } : {}),
    ...(layout ? { layout } : {}),
    flowchart: { useMaxWidth: false },
  };
}

/** A render time for a chip: two decimals under 10 ms, one under 100, then whole ms, then s. */
export function formatRenderMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${ms.toFixed(0)} ms`;
  if (ms >= 10) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(2)} ms`;
}

/**
 * How many timed `render()` calls a pane makes per text (#358). One sample understated v13 a
 * lot (1.4× shown, 35× measured), since both iframes render at the same moment.
 */
export const TIMED_RENDERS = 5;

/** A pane's timed renders of one text, summed up for its chips. */
export interface RenderTimes {
  /** The middle time; the mean of the middle two for an even count. */
  readonly median: number;
  readonly min: number;
  readonly max: number;
  /** How many times went in. */
  readonly runs: number;
}

/** The median, min and max of `times`; `undefined` when there is no finite time. */
export function summarizeRenderTimes(times: readonly number[]): RenderTimes | undefined {
  const sorted = times.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return undefined;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { median, min: sorted[0]!, max: sorted[n - 1]!, runs: n };
}

/** Within this factor of each other, two render times count as the same speed. */
const SAME_SPEED = 1.05;

export interface SpeedComparison {
  readonly kind: 'faster' | 'slower' | 'same';
  /** The larger time over the smaller one, so at least 1. */
  readonly ratio: number;
  /** `2.4× faster`, `12× slower`, `same speed`. */
  readonly label: string;
}

/** How a pane's render time `ms` compares with the other pane's; `undefined` without both. */
export function compareSpeed(ms: number, otherMs: number): SpeedComparison | undefined {
  if (!(ms > 0) || !(otherMs > 0)) return undefined;
  const ratio = Math.max(ms, otherMs) / Math.min(ms, otherMs);
  if (ratio < SAME_SPEED) return { kind: 'same', ratio, label: 'same speed' };
  const kind = ms < otherMs ? 'faster' : 'slower';
  return { kind, ratio, label: `${ratio.toFixed(ratio >= 10 ? 0 : 1)}× ${kind}` };
}
