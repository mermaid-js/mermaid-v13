/**
 * #514: the `treemap` config section against v12 12.2.0's `treemapDb.getConfig()`
 * (`cleanAndMerge({...DEFAULT_CONFIG.treemap, ...getConfig().treemap})`, `db.ts:28-35`): the
 * plugin's generated defaults, and the section a render hands the layout, equal what v12's DB
 * returns for the same site config. v12 had no schema section for treemap; its defaults
 * (`defaultConfig.ts:326-337`) are the schema's. Out-of-range values (`TREEMAP_CONFIG_INVALID`,
 * D226) are gated by `packages/mermaid/src/treemap.spec.ts`.
 */
import { treemap } from '@mermaid-js/diagram-treemap';
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

const BODY = 'treemap\n  "a": 1\n';

/** v12's DB config for `BODY` with `config` initialised. */
async function v12Config(config: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(config);
  try {
    return { ...(await v12.mermaidAPI.getDiagramFromText(BODY)).db.getConfig() };
  } finally {
    v12.mermaidAPI.reset();
  }
}

/** The `treemap` section v13's layout is handed under `site` config. */
async function v13Config(site: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> | undefined;
  const spy = {
    ...treemap,
    layout: (...args: Parameters<typeof treemap.layout>) => {
      seen = { ...(args[1].config.treemap as Record<string, unknown>) };
      return treemap.layout(...args);
    },
  };
  const m = createMermaid();
  m.initialize({ deterministic: true, ...site });
  await m.registerExternalDiagrams([spy], { lazyLoad: false, replace: true });
  await m.render('cfg', BODY);
  if (!seen) throw new Error('the layout was not called');
  return seen;
}

const keysOf = (old: object, now: Record<string, unknown>): object =>
  Object.fromEntries(Object.keys(old).map((k) => [k, now[k]]));

describe('treemap config against v12 12.2.0 (#514)', () => {
  it('the plugin’s generated defaults are v12’s, key for key', async () => {
    expect(treemap.configDefaults).toEqual(await v12Config());
  });

  it('a site treemap config reaches the layout as v12’s DB has it', async () => {
    const site = {
      treemap: {
        padding: 4,
        diagramPadding: 0,
        showValues: false,
        nodeWidth: 80,
        nodeHeight: 0,
        valueFormat: '$0,0',
        useMaxWidth: false,
      },
    };
    const old = await v12Config(site);
    expect(keysOf(old, await v13Config(site))).toEqual(old);
  });
});
