/**
 * Config snapshots (R-ARCH-4, D72): the frozen `initialize()` config and integrator options an
 * API object renders with, per-call overlays of them, the config a diagram's init directives
 * give, and the integrator's side of a resolved config, cached per snapshot.
 */
import {
  CORE_DEFAULTS,
  KEY_TREE,
  resolveSite,
  type ConfigFragment,
  type ConfigInput,
  type MermaidConfig,
  type ResolvedSite,
} from '@mermaid-js/core/config';
import type { Warning } from '@mermaid-js/core';
import type { UnitProfile } from '@mermaid-js/core/layout';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import type { AnyPlugin, Detected } from './registry.ts';

/** Options only the integrator can set; never read from diagram text (R-SEC-5, R-SEC-6). */
export interface IntegratorOptions {
  /** Measures label text. Ignored under `deterministic: true` (R-TEXT-7, DESIGN §5.1). */
  measurer?: Measurer;
  /** Use the built-in metric tables, never the canvas (R-TEXT-7). */
  deterministic?: boolean;
  /** Replaces the default link schemes (http, https, mailto). */
  linkSchemes?: readonly string[];
  output?: { cssVariables?: boolean };
  /**
   * Resource limits (R-SEC-5); each wins over v12's `maxTextSize`/`maxEdges`. Over a limit,
   * render rejects with `MermaidError { code: 'LIMIT' }`. Diagram text cannot change them.
   */
  limits?: Partial<Limits>;
  /**
   * CDN build only (D163): the URL first-party chunks load from. Default: the directory the
   * mermaid file was loaded from. Read from `initialize()` alone; other builds ignore it.
   */
  cdnBase?: string;
}

/** `initialize()` input: the schema config plus the integrator-only options. */
export type InitializeConfig = MermaidConfig & IntegratorOptions;

const INTEGRATOR_KEYS = [
  'measurer',
  'deterministic',
  'linkSchemes',
  'output',
  'limits',
  'cdnBase',
] as const;

export type Plain = Record<string, unknown>;
export const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

// Arrays are copied too: the result is frozen, and the caller's own arrays must stay theirs.
function copyValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(copyValue);
  return isPlain(v) ? mergeInto({}, v) : v;
}

export function mergeInto(target: Plain, source: Plain): Plain {
  for (const [k, v] of Object.entries(source)) {
    if (UNSAFE.has(k) || v === undefined) continue;
    const t = target[k];
    target[k] = isPlain(v) ? mergeInto(isPlain(t) ? { ...t } : {}, v) : copyValue(v);
  }
  return target;
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export interface Snapshot {
  readonly config: Readonly<MermaidConfig>;
  readonly options: Readonly<IntegratorOptions>;
  /** From the integrator's config alone, before any diagram text is read. */
  readonly limits: Readonly<Limits>;
}

function withLimits(
  config: Readonly<MermaidConfig>,
  options: Readonly<IntegratorOptions>
): Snapshot {
  return { config, options, limits: resolveLimits(config, options.limits) };
}

/** Keys sorted, so equal configs serialise equally whatever their key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Plain)[k])}`);
    return `{${entries.join(',')}}`;
  }
  // undefined for undefined and functions, whatever its type says.
  return (JSON.stringify(value) as string | undefined) ?? 'null';
}

/** Integrator options as they enter a key: a measurer counts by its `id` (DESIGN §5.1). */
export function optionsKey(options: Readonly<IntegratorOptions>): unknown {
  // Where chunks load from never changes the output.
  const { measurer, cdnBase: _cdnBase, ...rest } = options;
  return measurer ? { ...rest, measurer: measurer.id } : rest;
}

/**
 * `mermaid-<FNV-1a 32 of text + resolved config + integrator options + unit profile>`: distinct
 * per diagram, deterministic (R-SVG-3, R-ARCH-6). Pass options through `optionsKey`, so a
 * measurer counts by its id and never by its state. The px profile adds nothing, so SVG ids
 * are as before units joined the key.
 */
export function defaultIdPrefix(
  text: string,
  config: unknown,
  options: unknown,
  units: UnitProfile
): string {
  const unit = units.id === 'px' ? '' : `\u0000${units.id}`;
  const input = `${text}\u0000${stableJson(config)}\u0000${stableJson(options)}${unit}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `mermaid-${(h >>> 0).toString(36)}`;
}

/** The frozen snapshot of an `initialize()` config. */
export function snapshot(input: InitializeConfig = {}): Snapshot {
  const config: Plain = {};
  const options: Plain = {};
  for (const [k, v] of Object.entries(input)) {
    if ((INTEGRATOR_KEYS as readonly string[]).includes(k)) options[k] = v;
    else if (!UNSAFE.has(k)) config[k] = v;
  }
  const merged = mergeInto({}, config) as MermaidConfig;
  // v12's legacy location of the font: `fontFamily` also sets `themeVariables.fontFamily`.
  if (typeof merged.fontFamily === 'string') {
    const vars = (merged.themeVariables ?? {}) as Plain;
    if (vars.fontFamily === undefined)
      merged.themeVariables = { ...vars, fontFamily: merged.fontFamily };
  }
  return withLimits(freeze(merged), Object.freeze(options) as IntegratorOptions);
}

function overlay(base: Snapshot, extra: InitializeConfig): Snapshot {
  const next = snapshot(extra);
  const limits =
    base.options.limits || next.options.limits
      ? { ...base.options.limits, ...next.options.limits }
      : undefined;
  return withLimits(
    freeze(mergeInto(mergeInto({}, base.config as Plain), next.config as Plain)),
    Object.freeze({ ...base.options, ...next.options, ...(limits ? { limits } : {}) })
  );
}

const OVERLAY_CACHE_SIZE = 16;

/**
 * Per-call configs merged over the `initialize()` snapshot. Equal per-call configs over the same
 * defaults give the same snapshot, so `prepare(text, o)` then `renderSync(text, o)` hits the
 * parse cache, and a fresh but equal object (or one changed in place) is keyed by what it
 * holds, not by its identity.
 */
export class Overlays {
  private base: Snapshot | undefined;
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly measurerIds = new WeakMap<object, number>();
  private measurers = 0;

  /** `site` with `extra` merged over it. */
  get(site: Snapshot, extra: InitializeConfig): Snapshot {
    if (this.base !== site) {
      this.snapshots.clear();
      this.base = site;
    }
    const key = this.key(extra);
    let s = this.snapshots.get(key);
    if (s) {
      this.snapshots.delete(key);
    } else {
      s = overlay(site, extra);
      if (this.snapshots.size >= OVERLAY_CACHE_SIZE)
        this.snapshots.delete(this.snapshots.keys().next().value!);
    }
    this.snapshots.set(key, s);
    return s;
  }

  // A measurer counts by identity: two measurers are never equal by their contents.
  private key(extra: InitializeConfig): string {
    const { measurer, ...rest } = extra as Plain;
    if (measurer === undefined || measurer === null || typeof measurer !== 'object')
      return stableJson(extra);
    let n = this.measurerIds.get(measurer);
    if (n === undefined) this.measurerIds.set(measurer, (n = ++this.measurers));
    return `${n}\u0000${stableJson(rest)}`;
  }
}

/** A diagram's config section, or its chain of sections, highest first (D534). */
export type Sections = string | readonly string[] | undefined;

/**
 * Init directive config in source order (v12's `config` key moved into the section). With a
 * chain of sections (`['swimlane', 'flowchart']`, D534), each `config` key goes to the first
 * section when that section's schema has it (`look` and any key without a default included),
 * else to the last; keys both schemas have resolve into both (`resolveAppearance`).
 */
export function directiveConfig(pre: PreprocessResult, section: Sections): ConfigInput[] {
  const out: ConfigInput[] = [];
  const [first, last] = [section ?? []].flat();
  const own = (KEY_TREE as Plain)[first!];
  for (const d of pre.directives) {
    if (d.kind === 'wrap') out.push({ wrap: true });
    else if (d.kind === 'init' && isPlain(d.args)) {
      const args: Plain = { ...d.args };
      const value = args.config;
      // v12 detectInit: an init `config` key belongs to the detected diagram's section.
      if (value !== undefined && first) {
        delete args.config;
        const parts: [string, unknown][] =
          last && isPlain(value) && isPlain(own)
            ? Object.entries(value).map(([k, v]) => [k in own ? first : last, { [k]: v }])
            : [[first, value]];
        for (const [s, v] of parts)
          args[s] = isPlain(args[s]) && isPlain(v) ? mergeInto({ ...args[s] }, v) : v;
      }
      out.push(args);
    }
  }
  return out;
}

/** The integrator's side of a config, and the warnings resolving it gave. */
export interface SiteConfig {
  readonly site: ResolvedSite;
  readonly warnings: readonly Warning[];
}

/**
 * Everything in a resolved config but the diagram text's own part depends only on the
 * snapshot, the plugin, the detected type and the registered config fragments: it is resolved
 * once, and its warnings replayed.
 */
export class SiteConfigs {
  private bySnapshot = new WeakMap<Snapshot, WeakMap<AnyPlugin, Map<string, SiteConfig>>>();
  private fragments: readonly ConfigFragment[] = [];

  get(
    snap: Snapshot,
    plugin: AnyPlugin,
    detected: Detected,
    section: Sections,
    fragments: readonly ConfigFragment[]
  ): SiteConfig {
    if (fragments !== this.fragments) {
      this.fragments = fragments;
      this.bySnapshot = new WeakMap();
    }
    let byPlugin = this.bySnapshot.get(snap);
    if (!byPlugin) this.bySnapshot.set(snap, (byPlugin = new WeakMap()));
    let byType = byPlugin.get(plugin);
    if (!byType) byPlugin.set(plugin, (byType = new Map<string, SiteConfig>()));
    const key = `${String(section)}\0${detected.type}`;
    let hit = byType.get(key);
    if (!hit) {
      const pluginDefaults: Plain = {};
      // The plugin's defaults go to its own section. A type's own section (D534) has its
      // defaults in core's; where both sections have a key (`theme`, `useMaxWidth`) the defaults
      // agree, so which one wins does not matter (`swimlanesDiagram.spec.ts` checks).
      if (plugin.configDefaults)
        pluginDefaults[plugin.configSection ?? plugin.id] = plugin.configDefaults;
      // The plugin's engine (D284), and the type's default layout (v12's flowchart-elk detector's
      // `elk`, swimlane's `swimlane`), sit below the user's config.
      if (plugin.layoutEngine) pluginDefaults.layout = plugin.layoutEngine.default;
      if (detected.layout) pluginDefaults.layout = detected.layout;
      const recorded: Warning[] = [];
      const site = resolveSite(CORE_DEFAULTS, snap.config, pluginDefaults as MermaidConfig, {
        warn: (w) => void recorded.push(w),
        section,
        ...(fragments.length > 0 ? { fragments } : {}),
      });
      hit = { site, warnings: recorded };
      byType.set(key, hit);
    }
    return hit;
  }
}
