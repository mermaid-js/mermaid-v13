import { beforeAll, describe, expect, it } from 'vitest';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { railroadLayoutViolations } from './invariants.ts';
import { layoutRailroad } from './layout.ts';
import {
  boldMeasurer,
  context,
  find,
  FIXTURES,
  parsed,
  v12Measurer,
  type ParsedRailroad,
} from './layout.fixtures.ts';
import type { RailroadExpressionLayout, RailroadLayout, RailroadRuleLayout } from './types.ts';

/** Option sets laid over each fixture's own `railroad` config. */
const OVERRIDES: readonly Readonly<Record<string, unknown>>[] = [
  {},
  { arcRadius: 20 },
  { arcRadius: 0, padding: 0, verticalSeparation: 0, horizontalSeparation: 0 },
  { verticalSeparation: 40, markerRadius: 12, strokeWidth: 6 },
  { fontSize: 40 },
];

let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'), {});
});

const MEASURERS = [tableMeasurer, v12Measurer, boldMeasurer];

describe('layout invariants on the e2e fixtures (parser-produced)', () => {
  it('finds every notation among the fixtures', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(27);
    const notations = new Set(FIXTURES.map(([, src]) => parsed(src).model.notation));
    expect(notations).toEqual(new Set(['railroad', 'railroadEbnf', 'railroadAbnf', 'railroadPeg']));
  });

  it.each(FIXTURES)('%s', (_path, source) => {
    const { model, diagnostics, section } = parsed(source);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    for (const measurer of MEASURERS) {
      for (const o of OVERRIDES) {
        const layout = layoutRailroad(model, context({ ...section, ...o }, measurer, theme));
        expect(
          railroadLayoutViolations(model, layout),
          `${measurer.id} ${JSON.stringify(o)}`
        ).toEqual([]);
      }
    }
  });
});

/** A deep, writable copy to break. */
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const copy = (l: RailroadLayout): Mutable<RailroadLayout> =>
  JSON.parse(JSON.stringify(l)) as Mutable<RailroadLayout>;

describe('each invariant catches its breach', () => {
  let base: ParsedRailroad;
  let layout: RailroadLayout;
  beforeAll(() => {
    base = parsed(`railroad-beta
a = sequence(terminal("x"), choice(nonterminal("p"), terminal("q")), optional(terminal("o")), zeroOrMore(special("s"))) ;
b = terminal("y") ;
`);
    layout = layoutRailroad(base.model, context(base.section, v12Measurer, theme));
  });

  const breaks = (mutate: (l: Mutable<RailroadLayout>) => void, message: RegExp) => {
    const l = copy(layout);
    mutate(l);
    const v = railroadLayoutViolations(base.model, l as RailroadLayout);
    expect(v.join('\n')).toMatch(message);
  };
  const rule = (l: Mutable<RailroadLayout>, i = 0) => l.rules[i] as Mutable<RailroadRuleLayout>;
  const of = (l: Mutable<RailroadLayout>, kind: RailroadExpressionLayout['kind']) =>
    find(rule(l) as RailroadRuleLayout, kind) as Mutable<RailroadExpressionLayout>;

  it('holds unbroken', () => {
    expect(railroadLayoutViolations(base.model, layout)).toEqual([]);
  });

  it('no NaN', () => breaks((l) => void (rule(l).definition.up = Number.NaN), /is NaN/));

  it('boxes never overlap', () =>
    breaks((l) => void (of(l, 'nonterminal').x -= 30), /overlap|outside its box/));

  it('boxes never overlap, even when each stays inside its parent', () =>
    breaks((l) => {
      const seq = rule(l).definition;
      seq.children[1]!.x = seq.children[0]!.x;
    }, /overlap/));

  it('every choice branch joins the main line at both ends', () =>
    breaks((l) => void of(l, 'choice').paths.splice(1, 1), /does not rejoin the main line/));

  it('every choice branch leaves the main line', () =>
    breaks((l) => {
      const p = of(l, 'choice').paths[0]!;
      p.start = { x: 0, y: p.start.y + 1 };
    }, /does not leave the main line/));

  it('arcs stay inside their expression box', () =>
    breaks((l) => {
      const bypass = of(l, 'optional').paths[2]!;
      bypass.segments[2] = { ...bypass.segments[2]!, y: -4 } as never;
    }, /track point .* outside its box/));

  it('corners are quarter circles of arcRadius', () =>
    breaks((l) => {
      const loop = of(l, 'repetition').paths[2]!;
      loop.segments[0] = { ...loop.segments[0]!, radius: 3 } as never;
    }, /not a quarter circle/));

  it('markers at both ends', () =>
    breaks((l) => void (rule(l).end.cx -= 40), /markers are not at both ends|lead-out/));

  it('the lead-in reaches the definition', () =>
    breaks((l) => void (rule(l).definition.x += 1), /lead-in/));

  it('rules never overlap', () =>
    breaks((l) => void (rule(l, 1).origin.y = rule(l, 0).origin.y + 10), /overlap|starts inside/));

  it('contents inside the bounding box', () =>
    breaks(
      (l) => void (l.bounds.width = rule(l).width - 5),
      /a (path|marker) is outside the bounds/
    ));

  it('the layout follows the model', () =>
    breaks((l) => void (of(l, 'terminal').ast = 'rule:zz/0' as never), /the model has terminal/));
});
