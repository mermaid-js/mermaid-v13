/**
 * #469: the `cynefin` config section against v12 12.2.0's `cynefinDb.getConfig()`
 * (`cleanAndMerge(DEFAULT_CONFIG.cynefin, getConfig().cynefin)`, `cynefinDb.ts:71-76`): the
 * plugin's generated defaults, and the section a render resolves from site config, an
 * `%%{init}%%` directive and front matter, equal what v12's DB returns for the same config.
 * v13's side is the `ctx.config.cynefin` the plugin's layout is handed. v12 is given the config
 * through `initialize` (v12's `render` merges a directive or front matter the same way, and
 * `getDiagramFromText` alone does not read them; reading them is core's preprocess, shared by
 * every type and gated in `preprocess.spec.ts`).
 */
import { cynefin } from '@mermaid-js/diagram-cynefin';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getDiagramFromText(text: string): Promise<{ db: { getConfig(): object } }>;
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

/** v12's DB config for `text` with `config` initialised. */
async function v12Config(text: string, config: Record<string, unknown> = {}): Promise<object> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(config);
  try {
    return { ...(await v12.mermaidAPI.getDiagramFromText(text)).db.getConfig() };
  } finally {
    v12.mermaidAPI.reset();
  }
}

/** The `cynefin` section v13's layout is handed for `text` under `site` config. */
async function v13Config(text: string, site: Record<string, unknown> = {}): Promise<object> {
  let seen: object | undefined;
  const spy = {
    ...cynefin,
    layout: (...args: Parameters<typeof cynefin.layout>) => {
      seen = { ...(args[1].config.cynefin as object) };
      return cynefin.layout(...args);
    },
  };
  const m = createMermaid();
  m.initialize({ deterministic: true, ...site });
  await m.registerExternalDiagrams([spy], { lazyLoad: false, replace: true });
  await m.render('cfg', text);
  if (!seen) throw new Error('the layout was not called');
  return seen;
}

/** The keys v12's DB reports, from v13's section (v13 also carries `look`, `theme`, … if set). */
const keysOf = (old: object, now: object): object =>
  Object.fromEntries(Object.keys(old).map((k) => [k, (now as Record<string, unknown>)[k]]));

const BODY = 'cynefin-beta\n  complex\n    "a"\n';

type Config = Record<string, unknown>;

/** `[name, v13 text, v13 site config, the config v12 ends up with]`. */
const CASES: readonly [name: string, text: string, site: Config, oldConfig: Config][] = [
  ['no config', BODY, {}, {}],
  [
    'site config',
    BODY,
    { cynefin: { width: 1000, seed: 42, showDomainDescriptions: false } },
    { cynefin: { width: 1000, seed: 42, showDomainDescriptions: false } },
  ],
  [
    'an init directive',
    '%%{init: {"cynefin": {"height": 300, "padding": 0, "boundaryAmplitude": 15}}}%%\n' + BODY,
    {},
    { cynefin: { height: 300, padding: 0, boundaryAmplitude: 15 } },
  ],
  [
    'front matter',
    '---\nconfig:\n  cynefin:\n    useMaxWidth: false\n    seed: 7\n---\n' + BODY,
    {},
    { cynefin: { useMaxWidth: false, seed: 7 } },
  ],
  [
    'front matter over site config',
    '---\nconfig:\n  cynefin:\n    width: 640\n---\n' + BODY,
    { cynefin: { width: 1000, height: 500 } },
    { cynefin: { width: 640, height: 500 } },
  ],
];

describe('cynefin config against v12 12.2.0 (#469)', () => {
  it('generated defaults are v12’s getConfig() with no config', async () => {
    const old = await v12Config(BODY);
    expect(old).toEqual({
      useMaxWidth: true,
      width: 800,
      height: 600,
      padding: 40,
      showDomainDescriptions: true,
      boundaryAmplitude: 8,
      seed: 0,
    });
    expect(cynefin.configDefaults).toEqual(old);
  });

  it.each(CASES)('%s: the layout gets v12’s getConfig()', async (_name, text, site, given) => {
    const old = await v12Config(BODY, given);
    expect(keysOf(old, await v13Config(text, site))).toEqual(old);
  });
});
