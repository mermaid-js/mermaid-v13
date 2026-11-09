import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, isThemeName, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutUsecase, parseUsecase, type UsecaseModel } from '@mermaid-js/diagram-usecase';
import { usecaseLayoutProblems } from '@mermaid-js/diagram-usecase/testing';
import elkLayouts from '@mermaid-js/layout-elk';
import { usecaseCases, usecaseCorpus } from './corpus.ts';

// DDLT on parser-produced usecase graphs (spec #517 T3, the `ddlt` rule: parse the source, never
// hand build the graph): the e2e corpus, the harvested v12 spec and syntax-page strings and the
// hand-written cases, parsed by the v13 parser with each source's own config (front matter and
// directives), measured with the table measurer in its theme and laid out by `layoutUsecase`,
// the entry point the plugin calls, through `layered` (the default, R-LAYOUT-7), ELK
// (`@mermaid-js/layout-elk`) and `compass` (D327). Every layout must hold the invariants of
// `usecaseLayoutProblems`: no NaN; nothing outside the drawing; no overlaps; members inside their
// boundary and non-members outside; notes beside their target; edge ends on the drawn outline.

interface Fixture {
  readonly id: string;
  readonly model: UsecaseModel;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly theme: Theme;
}

const fixtures: Fixture[] = [];
let elk: LayoutEngine;

beforeAll(async () => {
  elk = await elkLayouts.find((l) => l.name === 'elk')!.loader();
  const themes = new Map<string, Theme>();
  for (const item of [...(await usecaseCorpus()), ...usecaseCases()]) {
    const pre = preprocess(item.source);
    const parse = parseUsecase(item.source, { preprocessed: pre });
    if (parse.diagnostics.some((d) => d.severity === 'error')) continue;
    const directives = pre.directives.flatMap((d) =>
      d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
    );
    const config = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, directives);
    const name =
      typeof config.theme === 'string' && isThemeName(config.theme) ? config.theme : 'default';
    let theme = themes.get(name);
    if (!theme) themes.set(name, (theme = createTheme(await loadTheme(name))));
    fixtures.push({ id: item.id, model: parse.model, config, theme });
  }
}, 120_000);

/**
 * What an engine is known to miss, exactly. `compass` holds each group as a rigid block (D326's
 * known gap), so a note outside a boundary cannot reach a member behind another one.
 */
const KNOWN: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  layered: {},
  elk: {},
  compass: {
    'v12-specs/usecase/usecase.parser.spec.ts#51': [
      "note 'note:1' has 'actor:User' between it and its target",
    ],
  },
};

const ENGINES: readonly [string, () => LayoutEngine][] = [
  ['layered', () => layered],
  ['elk', () => elk],
  ['compass', () => compass],
];

function laidOut(f: Fixture, engine: LayoutEngine) {
  return layoutUsecase(f.model, {
    config: f.config,
    measurer: tableMeasurer,
    theme: f.theme,
    warn: () => {},
    layout: (g) => engine(g),
  });
}

describe('usecase layout over parser-produced graphs', () => {
  it('reads a corpus with every kind of node, boundaries of both types and notes', () => {
    expect(fixtures.length).toBeGreaterThan(150);
    const models = fixtures.map((f) => f.model);
    expect(models.some((m) => m.boundaries.some((b) => b.type === 'package'))).toBe(true);
    expect(models.some((m) => m.boundaries.some((b) => b.type === 'rect'))).toBe(true);
    expect(models.some((m) => m.notes.length > 0)).toBe(true);
    expect(models.some((m) => m.jsonTables.length > 0)).toBe(true);
    expect(models.some((m) => m.useCases.some((u) => u.shape === 'rect'))).toBe(true);
    expect(models.some((m) => m.relationships.some((r) => r.minlen > 1))).toBe(true);
    for (const d of ['TB', 'BT', 'LR', 'RL'] as const)
      expect(
        models.some((m) => m.direction === d),
        d
      ).toBe(true);
  });

  it.each(ENGINES)(
    'holds every invariant with %s',
    (name, engine) => {
      const bad: Record<string, string[]> = {};
      for (const f of fixtures) {
        const problems = usecaseLayoutProblems(laidOut(f, engine()));
        if (problems.length > 0) bad[f.id] = problems;
      }
      expect(bad).toEqual(KNOWN[name]);
    },
    240_000
  );
});
