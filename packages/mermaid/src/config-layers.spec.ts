/**
 * The per-render config layers against their old forms, kept here as references: `directiveConfig`
 * as it was (sections spread with `flat`, no early return) and `SiteConfigs` keyed by one joined
 * string. Then the public seam: two config snapshots used alternately by one API object give
 * what a fresh object gives for each, warnings and resolved config included.
 */
import {
  CORE_DEFAULTS,
  KEY_TREE,
  resolveSite,
  type ConfigFragment,
  type ConfigInput,
  type MermaidConfig,
} from '@mermaid-js/core/config';
import type { Warning } from '@mermaid-js/core';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { describe, expect, it } from 'vitest';
import {
  directiveConfig,
  isPlain,
  mergeInto,
  SiteConfigs,
  snapshot,
  type Plain,
  type Sections,
  type SiteConfig,
  type Snapshot,
} from './config-snapshot.ts';
import { createMermaid } from './index.ts';
import type { AnyPlugin, Detected } from './registry.ts';

function oldDirectiveConfig(pre: PreprocessResult, section: Sections): ConfigInput[] {
  const out: ConfigInput[] = [];
  const [first, last] = [section ?? []].flat();
  const own = (KEY_TREE as Record<string, Plain>)[first!]!;
  for (const d of pre.directives) {
    if (d.kind === 'wrap') out.push({ wrap: true });
    else if (d.kind === 'init' && isPlain(d.args)) {
      const args: Plain = { ...d.args };
      const value = args.config;
      if (value !== undefined && first) {
        delete args.config;
        const parts: [string, unknown][] =
          last && isPlain(value)
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

class OldSiteConfigs {
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
      if (plugin.configDefaults)
        pluginDefaults[plugin.configSection ?? plugin.id] = plugin.configDefaults;
      if (detected.section)
        pluginDefaults[detected.section] = (CORE_DEFAULTS as Plain)[detected.section];
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

let seed = 3;
const next = (n: number) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed >>> 8) % n;
};
const pick = <T>(xs: readonly T[]): T => xs[next(xs.length)]!;

/** Directives that touch every branch: `wrap`, `init` with and without `config`, odd args. */
const DIRECTIVES = [
  '%%{wrap}%%',
  '%%{init: {"theme": "dark"}}%%',
  '%%{init: {"config": {"curve": "linear", "useMaxWidth": false}}}%%',
  '%%{init: {"config": {"lanes": 3}}}%%',
  '%%{init: {"config": 5}}%%',
  '%%{init: {"flowchart": {"curve": "basis"}, "config": {"curve": "step"}}}%%',
  '%%{init: {"swimlane": {"x": 1}, "config": {"x": 2}}}%%',
  '%%{init: ["a"]}%%',
  '%%{initialize: {"look": "handDrawn"}}%%',
  '%%{init: {"securityLevel": "loose"}}%%',
  '%%{ init: }%%',
  '%%{unknown}%%',
];

const SECTIONS: Sections[] = [
  undefined,
  'flowchart',
  'sequence',
  ['swimlane', 'flowchart'],
  ['swimlane', 'flowchart', 'gantt'],
  [],
];

describe('directiveConfig against its old form', () => {
  it('gives the same config for generated directives and every kind of section', () => {
    let compared = 0;
    for (let t = 0; t < 400; t++) {
      let src = next(4) === 0 ? '---\nconfig:\n  theme: forest\n---\n' : '';
      for (let n = next(4); n > 0; n--) src += `${pick(DIRECTIVES)}\n`;
      src += 'flowchart TD\nA-->B\n';
      if (next(3) === 0) src += `${pick(DIRECTIVES)}\n`;
      const pre = preprocess(src);
      for (const section of SECTIONS) {
        const got = directiveConfig(pre, section);
        expect(got).toEqual(oldDirectiveConfig(pre, section));
        compared++;
      }
    }
    expect(compared).toBe(2400);
  });
});

describe('SiteConfigs against its old form', () => {
  const plugins = [
    flowchart as unknown as AnyPlugin,
    { ...flowchart, configDefaults: { curve: 'linear' } } as unknown as AnyPlugin,
  ];
  const detections: Detected[] = [
    { type: 'flowchart', id: 'flowchart' },
    { type: 'graph', id: 'flowchart' },
    { type: 'flowchart-elk', id: 'flowchart', layout: 'elk' },
    { type: 'swimlane', id: 'flowchart', section: 'swimlane' },
  ];
  const fragment: ConfigFragment = {
    id: 'fixture',
    keys: { fixture: { mode: 0 } },
    defaults: { fixture: { mode: 'plain' } },
    aliases: [{ from: 'look', when: 'sketchy', to: 'fixture.mode', value: 'sketch' }],
  };
  const fragmentLists: (readonly ConfigFragment[])[] = [[], [fragment], [fragment]];
  const snaps = [
    snapshot({ theme: 'dark', look: 'sketchy' } as unknown as MermaidConfig),
    snapshot({ flowchart: { curve: 'step' }, notAKey: 1 } as MermaidConfig),
    snapshot(),
  ];

  it('resolves, replays warnings and reuses entries as before over a long mixed sequence', () => {
    const now = new SiteConfigs();
    const old = new OldSiteConfigs();
    const seenNow = new Set<SiteConfig>();
    const seenOld = new Set<SiteConfig>();
    for (let t = 0; t < 3000; t++) {
      const snap = pick(snaps);
      const plugin = pick(plugins);
      const detected = pick(detections);
      const section = pick(SECTIONS);
      const fragments = next(50) === 0 ? pick(fragmentLists) : fragmentLists[1]!;
      const a = now.get(snap, plugin, detected, section, fragments);
      const b = old.get(snap, plugin, detected, section, fragments);
      expect(a).toEqual(b);
      // A cached entry where the old one was cached, a new one where it resolved afresh.
      expect(seenNow.has(a)).toBe(seenOld.has(b));
      seenNow.add(a);
      seenOld.add(b);
    }
  });
});

describe('config snapshots used alternately by one API object', () => {
  const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';
  const texts = [
    FLOW,
    `---\nconfig:\n  theme: forest\n  flowchart:\n    curve: linear\n---\n${FLOW}`,
    `---\nconfig:\n  look: handDrawn\n  securityLevel: loose\n  notAKey: 2\n---\n${FLOW}`,
    `%%{init: {"theme": "neutral", "config": {"curve": "step"}}}%%\n${FLOW}`,
    `%%{init: {"themeVariables": {"primaryColor": "url(x)"}, "fontFamily": "a<b"}}%%\n${FLOW}`,
    `---\nconfig:\n  layout: elk\n---\n%%{wrap}%%\n${FLOW}`,
    `%%{init: {"flowchart": {"look": "neo"}}}%%\n${FLOW}`,
  ];
  const configs: MermaidConfig[] = [
    { theme: 'dark', look: 'handDrawn', flowchart: { curve: 'basis' } } as MermaidConfig,
    { fontFamily: 'serif', secure: ['theme'], notAKey: 1 } as MermaidConfig,
  ];

  /** What one render gives that depends on the config: the SVG, warnings and parse config. */
  const outcome = async (m: ReturnType<typeof createMermaid>, text: string, c: MermaidConfig) => {
    const r = m.renderSync(text, { id: 'x', config: c });
    const prepared = await m.prepare(text, { config: c });
    return { svg: r.svg, warnings: r.warnings, config: prepared.config };
  };

  it('gives each render what a fresh API object gives it', async () => {
    const shared = createMermaid();
    const fresh = new Map<string, Awaited<ReturnType<typeof outcome>>>();
    for (const [i, c] of configs.entries())
      for (const text of texts) {
        const m = createMermaid();
        await m.prepare(text, { config: c });
        fresh.set(`${i}\0${text}`, await outcome(m, text, c));
      }
    for (const text of texts) await shared.prepare(text, { config: configs[0] });
    for (let round = 0; round < 3; round++)
      for (const text of texts)
        for (const [i, c] of configs.entries()) {
          expect(await outcome(shared, text, c)).toEqual(fresh.get(`${i}\0${text}`));
        }
  });
});
