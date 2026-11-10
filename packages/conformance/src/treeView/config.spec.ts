/**
 * #577: the `treeView` config section against v12 12.2.0's `db.getConfig()`
 * (`cleanAndMerge(defaultConfig, getConfig().treeView)`, `db.ts:48-50`): the plugin's generated
 * defaults, and the section a render hands the layout, equal what v12's DB returns for the same
 * site config. Out-of-range values (`TREEVIEW_CONFIG_INVALID`, D226) are gated by
 * `packages/mermaid/src/treeView.spec.ts`.
 */
import { treeView } from '@mermaid-js/diagram-treeview';
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

const BODY = 'treeView-beta\n  a\n';

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

/** The `treeView` section v13's layout is handed under `site` config. */
async function v13Config(site: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> | undefined;
  const spy = {
    ...treeView,
    layout: (...args: Parameters<typeof treeView.layout>) => {
      seen = { ...(args[1].config.treeView as Record<string, unknown>) };
      return treeView.layout(...args);
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

describe('treeView config against v12 12.2.0 (#577)', () => {
  it('the plugin’s generated defaults are v12’s, key for key', async () => {
    expect(treeView.configDefaults).toEqual(await v12Config());
  });

  it('a site treeView config reaches the layout as v12’s DB has it', async () => {
    const site = {
      treeView: {
        rowIndent: 4,
        paddingX: 0,
        paddingY: 9,
        lineThickness: 3,
        showIcons: true,
        defaultIconPack: 'fa',
        filenameIcons: { Dockerfile: 'logos:docker' },
        extensionIcons: { '.ts': 'none' },
        useMaxWidth: false,
      },
    };
    const old = await v12Config(site);
    expect(keysOf(old, await v13Config(site))).toEqual(old);
  });
});
