import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CORE_DEFAULTS,
  resolveConfig,
  type ResolvedConfig,
} from '../../../packages/core/src/config/index.ts';
import { tableMeasurer } from '../../../packages/core/src/text/index.ts';
import type { Theme } from '../../../packages/core/src/theme/index.ts';
import {
  layoutVenn,
  VENN_CONFIG_DEFAULTS,
  vennPluginDefaults,
  type VennLayout,
} from '../../../packages/diagram-venn/src/index.ts';
import { parsedVenn, vennTestTheme } from '../../../packages/diagram-venn/src/testing.ts';
import { SCHEMA_PATH, sectionDefaults } from './generate.ts';

/**
 * D412's padding through core's real config resolution (spec #429 T3; venn's section joins
 * `SECTION_OWNERS` in #501, so the defaults here are built as `generate()` builds an owner's): the one solve's padding
 * is an author's `venn.padding`, else 15, the padding v12 drew its circles with. The resolved
 * config cannot tell a default from an author's value, so the plugin hands core its section
 * defaults without `padding` (`vennPluginDefaults`, for #501's `configDefaults`): the solve keeps
 * 15 whatever default the schema generates, 8 (v12's schema) included. The layout's fallbacks
 * are the schema's defaults.
 */
const SCHEMA = readFileSync(join(import.meta.dirname, '../../..', SCHEMA_PATH), 'utf8');
const BODY = 'venn-beta\n  set A\n  set B\n  union A, B\n';

let theme: Theme;
beforeAll(async () => {
  theme = await vennTestTheme();
});

/** The layout of `src` under the config `resolveConfig` gives for it with `pluginDefaults`. */
function laid(src: string, pluginDefaults: Readonly<Record<string, unknown>>): VennLayout {
  const { model, config: frontMatter } = parsedVenn(src);
  const config: ResolvedConfig = resolveConfig(
    CORE_DEFAULTS,
    undefined,
    Object.keys(frontMatter).length > 0 ? { venn: frontMatter } : undefined,
    [],
    { venn: pluginDefaults } as never
  );
  return layoutVenn(model, { config, theme, measurer: tableMeasurer });
}

const radius = (layout: VennLayout): number => layout.areas[0]!.circle!.radius;

describe('venn.padding through resolveConfig (D412)', () => {
  const generated = sectionDefaults(SCHEMA, 'venn');
  /** The schema with v12's default of 8 for `venn.padding`, as gen:config would generate it. */
  const v12Schema = ((): string => {
    const section = SCHEMA.indexOf('\n  VennDiagramConfig:');
    const key = SCHEMA.indexOf('\n      padding:', section);
    const at = SCHEMA.indexOf('default: 15\n', key);
    return `${SCHEMA.slice(0, at)}default: 8\n${SCHEMA.slice(at + 'default: 15\n'.length)}`;
  })();

  it("generates the layout's fallbacks as the schema's defaults", () => {
    expect(generated).toMatchObject(VENN_CONFIG_DEFAULTS);
    expect(sectionDefaults(v12Schema, 'venn').padding).toBe(8);
  });

  it('solves at 15 with no author value, with or without the generated defaults', () => {
    for (const defaults of [
      {},
      vennPluginDefaults(generated),
      vennPluginDefaults(sectionDefaults(v12Schema, 'venn')),
    ]) {
      const layout = laid(BODY, defaults);
      expect(layout.padding).toBe(15);
      expect(radius(layout)).toBeCloseTo(210, 6);
    }
  });

  it("solves at an author's padding, 8 included", () => {
    const src = `---\nconfig:\n  venn:\n    padding: 8\n---\n${BODY}`;
    const layout = laid(src, vennPluginDefaults(sectionDefaults(v12Schema, 'venn')));
    expect(layout.padding).toBe(8);
    expect(radius(layout)).toBeCloseTo(217, 6);
  });
});
