/**
 * `resolveText` against the way it merged the site and the diagram text before the site kept a
 * copy of its base and `theme`/`layout` resolution stopped building arrays: the old `layered`
 * (with its `resolveAppearance`, `merge` and `clone`) is kept here as the reference, and both
 * resolve generated sources over generated sites.
 */
import { describe, expect, it } from 'vitest';
import {
  CORE_DEFAULTS,
  resolveSite,
  resolveText,
  type ConfigFragment,
  type ConfigInput,
  type ConfigWarning,
  type MermaidConfig,
  type ResolvedSite,
} from './index.ts';

type Plain = Record<string, unknown>;
const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const APPEARANCE_KEYS = ['theme', 'layout'];
const isPlainObject = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function oldClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(oldClone);
  if (isPlainObject(value)) {
    const out: Plain = {};
    for (const [key, child] of Object.entries(value))
      if (!POLLUTION_KEYS.has(key)) out[key] = oldClone(child);
    return out;
  }
  return value;
}

function oldMerge(dst: Plain, src: Plain): void {
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined || value === null || POLLUTION_KEYS.has(key)) continue;
    const current = dst[key];
    if (isPlainObject(value)) {
      if (isPlainObject(current)) {
        const into = Object.isFrozen(current) ? { ...current } : current;
        dst[key] = into;
        oldMerge(into, value);
      } else {
        const fresh: Plain = {};
        oldMerge(fresh, value);
        dst[key] = fresh;
      }
    } else if (Array.isArray(value) && Array.isArray(current)) {
      const into = Object.isFrozen(current) ? [...(current as unknown[])] : current;
      dst[key] = into;
      for (const item of value) if (!into.includes(item)) into.push(oldClone(item));
    } else {
      dst[key] = oldClone(value);
    }
  }
}

function oldResolveAppearance(
  config: Plain,
  layers: Plain[],
  { sections, keys }: Pick<ResolvedSite, 'keys' | 'sections'>
) {
  const scopedOf = (layer: Plain, s: string): Plain | undefined => {
    const value = layer[s];
    return isPlainObject(value) ? value : undefined;
  };
  for (const key of keys) {
    const top = APPEARANCE_KEYS.includes(key);
    const value = layers
      .flatMap((layer) => [
        ...sections.map((s) => scopedOf(layer, s)?.[key]),
        top ? layer[key] : undefined,
      ])
      .find((v) => (top ? typeof v === 'string' : v !== undefined));
    if (value === undefined) continue;
    if (top) config[key] = value;
    for (const s of sections) {
      const scoped = scopedOf(config, s);
      if ((sections[1] || scoped?.[key] !== undefined) && scoped?.[key] !== value)
        config[s] = { ...scoped, [key]: value };
    }
  }
}

/** The old `layered`, unfrozen (freezing does not change what `toEqual` sees). */
function oldLayered(site: ResolvedSite, text: Plain, under?: Plain): Plain {
  const config: Plain = { ...site.base };
  if (under) oldMerge(config, under);
  oldMerge(config, text);
  oldResolveAppearance(
    config,
    [text, site.site as Plain, site.plugin as Plain, site.defaults as Plain],
    site
  );
  return config;
}

/** The diagram text's own layer: `resolveText` over a site that adds nothing. */
function textLayer(site: ResolvedSite, front?: ConfigInput, directives: ConfigInput[] = []): Plain {
  if (front === undefined && directives.length === 0) return {};
  const empty: ResolvedSite = {
    ...site,
    base: {},
    site: {},
    plugin: {},
    defaults: {},
    keys: [],
    sections: [],
  };
  return oldClone(resolveText(empty, front, directives)) as Plain;
}

/** Key order counts too: the resolved config is serialised into the id prefix. */
const ordered = (v: unknown): string => JSON.stringify(v);

let seed = 5;
const next = (n: number) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed >>> 8) % n;
};
const pick = <T>(xs: readonly T[]): T => xs[next(xs.length)]!;

const THEMES = ['dark', 'forest', 'neutral', 7, '', undefined];
const LAYOUTS = ['elk', 'dagre', 'swimlane', true, undefined];

/** One generated config source: appearance keys in odd places, and the keys that warn. */
function source(): Plain {
  const out: Plain = {};
  for (let n = next(6); n > 0; n--) {
    switch (next(14)) {
      case 0:
        out.theme = pick(THEMES);
        break;
      case 1:
        out.layout = pick(LAYOUTS);
        break;
      case 2:
        out.flowchart = { ...(out.flowchart as Plain), theme: pick(THEMES) };
        break;
      case 3:
        out.flowchart = { ...(out.flowchart as Plain), layout: pick(LAYOUTS) };
        break;
      case 4:
        out.swimlane = { ...(out.swimlane as Plain), useMaxWidth: pick([true, false, 3]) };
        break;
      case 5:
        out.flowchart = { ...(out.flowchart as Plain), useMaxWidth: pick([true, false]) };
        break;
      case 6:
        out.look = pick(['handDrawn', 'classic', 'sketchy']);
        break;
      case 7:
        out.flowchart = { ...(out.flowchart as Plain), look: 'neo' };
        break;
      case 8:
        out.securityLevel = 'loose';
        break;
      case 9:
        out.fontFamily = pick(['serif', 'a<b', 'x{y']);
        break;
      case 10:
        out.themeVariables = { primaryColor: pick(['#fff', 'url(x)', 'red;']) };
        break;
      case 11:
        out.notAKey = 1;
        break;
      case 12:
        out.flowchart = { ...(out.flowchart as Plain), curve: pick(['basis', 'linear']) };
        break;
      default:
        out.legacyLook = 'sketchy';
    }
  }
  return out;
}

const fragment: ConfigFragment = {
  id: 'fixture',
  keys: { fixture: { mode: 0 } },
  defaults: { fixture: { mode: 'plain' } },
  aliases: [{ from: 'legacyLook', when: 'sketchy', to: 'fixture.mode', value: 'sketch' }],
};

const SECTIONS: (string | string[] | undefined)[] = [
  'flowchart',
  ['swimlane', 'flowchart'],
  undefined,
  'sequence',
];

describe('resolveText against the old merge', () => {
  it('resolves generated texts over generated sites as before, key order included', () => {
    let compared = 0;
    for (let s = 0; s < 120; s++) {
      const section = pick(SECTIONS);
      const pluginDefaults = pick<MermaidConfig | undefined>([
        { flowchart: { curve: 'basis', theme: 'forest' } },
        { flowchart: {} },
        undefined,
        { sequence: { mirrorActors: true } },
      ]);
      const initialize = next(2) ? (source() as MermaidConfig) : undefined;
      const options = {
        warn: (_: ConfigWarning) => undefined,
        ...(section === undefined ? {} : { section }),
        ...(next(2) ? { fragments: [fragment] } : {}),
      };
      const site = resolveSite(CORE_DEFAULTS, initialize, pluginDefaults, options);
      // The old base: the defaults, the plugin's and the integrator's layers merged in turn.
      const base = oldClone(site.defaults) as Plain;
      oldMerge(base, site.plugin as Plain);
      oldMerge(base, site.site as Plain);
      expect(ordered(site.base)).toBe(ordered(base));
      expect(ordered(site.plain)).toBe(ordered(oldLayered(site, {})));
      for (let t = 0; t < 12; t++) {
        const front = next(3) ? source() : undefined;
        const directives = Array.from({ length: next(3) }, source);
        const under = next(4) === 0 ? site.plain : undefined;
        const got = resolveText(site, front, directives, under ? { under } : {});
        const want = oldLayered(site, textLayer(site, front, directives), under);
        expect(ordered(got)).toBe(ordered(want));
        expect(Object.isFrozen(got)).toBe(true);
        compared++;
      }
    }
    expect(compared).toBe(1440);
  });
});
