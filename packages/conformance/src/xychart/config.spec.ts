/**
 * #513: the `xyChart` config section against v12 12.2.0. The plugin id is the type's, `xychart`;
 * v12's section is `xyChart`, so the plugin names it as its `configSection` (wardley's
 * `wardley-beta` precedent, #497), and `configDefaults`, front matter, `%%{init}` and
 * `initialize()` all land in `xyChart`, which the layout reads. The generated defaults are
 * v12's `defaultConfig.xyChart`, without the `"$ref"` key 12.2.0 leaks into each axis. v12's
 * DB read the section from every source but an init `config` key, which v12 put under the
 * detected type (`xychart`), where nothing read it; v13 gives it to `xyChart` (as wardley).
 * Value checks (`XYCHART_CONFIG_INVALID`) are gated by `packages/mermaid/src/xychart.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { xychart } from '@mermaid-js/diagram-xychart';
import { firstPartyFacets } from '@mermaid-js/language-service';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): Record<string, unknown>;
    getDiagramFromText(text: string): Promise<{ db: { getChartConfig(): object } }>;
    parse(text: string): Promise<unknown>;
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

const BODY = 'xychart\n  bar [1, 2]\n';
const SECTION = { width: 400, showDataLabel: true, xAxis: { labelRotation: 30 } };
const json = JSON.stringify(SECTION);

/** Each source a document or site can set the section from, as site config and text. */
const SOURCES: readonly (readonly [string, Record<string, unknown>, string])[] = [
  ['initialize()', { xyChart: SECTION }, BODY],
  [
    'front matter',
    {},
    `---\nconfig:\n  xyChart:\n    width: 400\n    showDataLabel: true\n    xAxis:\n      labelRotation: 30\n---\n${BODY}`,
  ],
  ['%%{init} section', {}, `%%{init: {"xyChart": ${json}}}%%\n${BODY}`],
  ['%%{init} config key', {}, `%%{init: {"config": ${json}}}%%\n${BODY}`],
];

type Section = Record<string, unknown>;

/** `section` without 12.2.0's leaked `"$ref"` axis key. */
const withoutRef = (section: Section): Section =>
  Object.fromEntries(
    Object.entries(section).map(([k, v]) => {
      if (!v || typeof v !== 'object') return [k, v];
      const { $ref: _, ...rest } = v as Section;
      return [k, rest];
    })
  );

/** v12's xychart DB (a module singleton, which every parse fills). */
const db = (await v12.mermaidAPI.getDiagramFromText(BODY)).db;

/**
 * v12's DB config for `text` with `config` initialised, through `mermaidAPI.parse`, which
 * applies front matter and directives first (`processAndSetConfigs`), as `render()` does.
 */
async function v12Config(config: Section, text: string): Promise<Section> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(config);
  try {
    await v12.mermaidAPI.parse(text);
    return { ...db.getChartConfig() } as Section;
  } finally {
    v12.mermaidAPI.reset();
  }
}

/** The `xyChart` section v13's layout is handed for `text` under `site` config. */
async function v13Config(site: Section, text: string): Promise<Section> {
  let seen: Section | undefined;
  const spy = {
    ...xychart,
    layout: (...args: Parameters<typeof xychart.layout>) => {
      seen = { ...(args[1].config.xyChart as Section) };
      return xychart.layout(...args);
    },
  };
  const m = createMermaid();
  m.initialize({ deterministic: true, ...site });
  await m.registerExternalDiagrams([spy], { lazyLoad: false, replace: true });
  await m.render('cfg', text);
  if (!seen) throw new Error('the layout was not called');
  return seen;
}

describe('the xyChart config section against v12 12.2.0 (#513)', () => {
  it('names one section in the plugin, the manifest, the facet row and the schema', () => {
    const at = (path: string) => new URL(`../../../${path}`, import.meta.url);
    const pkg = JSON.parse(readFileSync(at('diagram-xychart/package.json'), 'utf8')) as {
      mermaid: { id: string; section: string };
    };
    const schema = readFileSync(at('core/schema/config.schema.yaml'), 'utf8');
    expect([xychart.id, xychart.configSection]).toEqual(['xychart', 'xyChart']);
    expect(pkg.mermaid).toMatchObject({ id: xychart.id, section: xychart.configSection });
    expect(firstPartyFacets.find((e) => e.type === 'xychart')?.section).toBe(xychart.configSection);
    expect(schema).toContain(`\n  ${xychart.configSection}:\n    $ref: '#/$defs/XYChartConfig'\n`);
  });

  it('the generated defaults are v12’s defaultConfig.xyChart, but for the leaked "$ref"', async () => {
    v12.mermaidAPI.reset();
    const old = v12.mermaidAPI.getConfig().xyChart as Section;
    expect((old.xAxis as Section).$ref).toBe('#/$defs/XYChartAxisConfig');
    expect(xychart.configDefaults).toEqual(withoutRef(old));
    expect(await v13Config({}, BODY)).toEqual(xychart.configDefaults);
    expect(withoutRef(await v12Config({}, BODY))).toEqual(xychart.configDefaults);
  });

  it('v12 took the section from every source but an init `config` key', async () => {
    const seen = [];
    for (const [, site, text] of SOURCES) {
      const c = await v12Config(site, text);
      seen.push([c.width, c.showDataLabel, (c.xAxis as Section).labelRotation]);
    }
    expect(seen).toEqual([
      [400, true, 30],
      [400, true, 30],
      [400, true, 30],
      [700, false, 0],
    ]);
  });

  it.each(SOURCES.map(([label, site, text]) => [label, site, text]))(
    '%s: reaches the layout under xyChart',
    async (_label, site, text) => {
      const c = await v13Config(site, text);
      expect(c).toMatchObject({ width: 400, showDataLabel: true, xAxis: { labelRotation: 30 } });
      expect(c.height).toBe(500);
    }
  );
});
