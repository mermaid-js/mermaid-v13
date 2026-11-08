/**
 * #497: the `wardley-beta` config section against v12 12.2.0 (D421). v12's DB read
 * `getConfig()['wardley-beta']` (`wardleyDb.ts:16-18`), which only `initialize()` set: the key
 * is not in v12's `defaultConfig`, so its sanitiser dropped it from front matter and `%%{init}`
 * (the spec's Q1, probed below). v13 honours the section from every source, as for every other
 * type: the plugin's `configSection` is v12's name, so `configDefaults`, front matter, `%%{init}`
 * and an init `config` key all land in `wardley-beta`, which the layout reads. The schema's
 * defaults are v12's renderer defaults (`wardleyRenderer.ts:52-65`). Out-of-range values
 * (`WARDLEY_CONFIG_INVALID`, D424) are gated by `packages/mermaid/src/wardley.spec.ts`.
 */
import { wardley } from '@mermaid-js/diagram-wardley';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getDiagramFromText(text: string): Promise<{ db: { getConfig(): object | undefined } }>;
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

const BODY = 'wardley-beta\ncomponent A [0.5, 0.5]\n';
const SECTION = { width: 400, padding: 20, showGrid: true, useMaxWidth: false };
const json = JSON.stringify(SECTION);

/** Each source a document or site can set the section from, as text and site config. */
const SOURCES: readonly (readonly [string, Record<string, unknown>, string])[] = [
  ['initialize()', { 'wardley-beta': SECTION }, BODY],
  [
    'front matter',
    {},
    `---\nconfig:\n  wardley-beta:\n    width: 400\n    padding: 20\n    showGrid: true\n    useMaxWidth: false\n---\n${BODY}`,
  ],
  ['%%{init} section', {}, `%%{init: {"wardley-beta": ${json}}}%%\n${BODY}`],
  ['%%{init} config key', {}, `%%{init: {"config": ${json}}}%%\n${BODY}`],
];

/** v12's DB config for `text` with `config` initialised. */
async function v12Config(config: Record<string, unknown>, text: string): Promise<unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(config);
  try {
    return (await v12.mermaidAPI.getDiagramFromText(text)).db.getConfig();
  } finally {
    v12.mermaidAPI.reset();
  }
}

/** The `wardley-beta` section v13's layout is handed for `text` under `site` config. */
async function v13Config(
  site: Record<string, unknown>,
  text: string
): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> | undefined;
  const spy = {
    ...wardley,
    layout: (...args: Parameters<typeof wardley.layout>) => {
      seen = { ...(args[1].config['wardley-beta'] as Record<string, unknown>) };
      return wardley.layout(...args);
    },
  };
  const m = createMermaid();
  m.initialize({ deterministic: true, ...site });
  await m.registerExternalDiagrams([spy], { lazyLoad: false, replace: true });
  await m.render('cfg', text);
  if (!seen) throw new Error('the layout was not called');
  return seen;
}

describe('the wardley-beta config section against v12 12.2.0 (#497, D421)', () => {
  it('reads v12’s section name', () => {
    expect(wardley.configSection).toBe('wardley-beta');
  });

  it('the plugin’s generated defaults are v12’s renderer defaults, key for key', async () => {
    expect(wardley.configDefaults).toEqual({
      width: 900,
      height: 600,
      padding: 48,
      nodeRadius: 6,
      nodeLabelOffset: 8,
      axisFontSize: 12,
      labelFontSize: 10,
      showGrid: false,
      useMaxWidth: true,
    });
    expect(await v13Config({}, BODY)).toEqual(wardley.configDefaults);
  });

  it('v12 took the section from initialize() only; front matter and %%{init} were dropped', async () => {
    const seen = [];
    for (const [, site, text] of SOURCES) seen.push(await v12Config(site, text));
    expect(seen).toEqual([SECTION, undefined, undefined, undefined]);
  });

  it.each(SOURCES.map(([label, site, text]) => [label, site, text]))(
    '%s: reaches the layout as v12’s initialize() gave it',
    async (_label, site, text) => {
      expect(await v13Config(site, text)).toEqual({ ...wardley.configDefaults, ...SECTION });
    }
  );
});
