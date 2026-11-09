import { describe, expect, it } from 'vitest';
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import { RAILROAD_LAYOUT_DEFAULTS, railroadLayoutConfig } from '../config.ts';
import { parseRailroad } from '../parser/index.ts';
import { railroadLayoutViolations } from './invariants.ts';
import { layoutRailroad } from './layout.ts';
import { boldMeasurer, context, find, v12Measurer, v12Path } from './layout.fixtures.ts';
import type { RailroadLayout, RailroadRuleLayout } from './types.ts';

const lay = (
  src: string,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = v12Measurer
): RailroadLayout => {
  const { model, diagnostics } = parseRailroad(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const layout = layoutRailroad(model, context(section, measurer));
  expect(railroadLayoutViolations(model, layout)).toEqual([]);
  return layout;
};

const rule = (src: string, section?: Readonly<Record<string, unknown>>): RailroadRuleLayout =>
  lay(`railroad-beta\n${src}\n`, section).rules[0]!;

const paths = (r: RailroadRuleLayout, kind: 'choice' | 'repetition' | 'optional'): string[] =>
  find(r, kind)!.paths.map(v12Path);

/**
 * v12's renderer spec (`railroadRenderer.spec.ts`, 6 cases), on the layout: the same sources and
 * the same measurements (8 px a character, 16 px high), and its exact path strings in v12's
 * `PathBuilder` format, compared whole where v12 checked a part. The DOM checks (the `svg`'s
 * `width` and `max-width`) are the renderer's (T4, #613): the ported file
 * `src/v12-specs/railroadRenderer.spec.ts` stays skipped until then.
 *
 * D514's changes do not reach these cases: v12's spec measurer ignores the weight, and every
 * branch here is at least `2r` (22 px) from its main line. Listed differences: none.
 */
describe("v12's renderer spec, on the layout", () => {
  it('sets a viewBox that includes the full rendered diagram height', () => {
    const layout = lay(`railroad-beta
sign = choice(terminal("+"), terminal("-")) ;
number = sequence(optional(nonterminal("sign")), oneOrMore(nonterminal("digit"))) ;
list = sequence(terminal("["), optional(sequence(nonterminal("number"), zeroOrMore(sequence(terminal(","), nonterminal("number"))))), terminal("]")) ;
digit = choice(terminal("0"), terminal("1"), terminal("2"), terminal("3")) ;
`);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(150);
    // Worked from v12: rule heights max(40, defY + h + 2p) = 100, 96, 116, 188, each + 8.
    expect(layout.rules.map((r) => r.origin.y)).toEqual([10, 118, 222, 346]);
    expect(layout.height).toBe(346 + 188 + 8 + 10);
    expect(layout.bounds).toEqual({ x: 0, y: 0, width: layout.width, height: layout.height });
  });

  it('aligns rule markers with the centerline of tall expressions', () => {
    const r = rule('sign = choice(terminal("+"), terminal("-")) ;');
    expect(r.start.cy).toBe(40);
    expect(r.end.cy).toBe(40);
    expect(r.label.y).toBe(40);
    expect(paths(r, 'choice')[0]).toContain('M 0 40');
  });

  it('connects centered choice alternatives from the left edge', () => {
    const r = rule(
      'term = choice(nonterminal("number"), sequence(terminal("("), nonterminal("expression"), terminal(")"))) ;'
    );
    const number = find(r, 'nonterminal')!;
    expect([number.x, number.y]).toEqual([74, 0]);
    expect(paths(r, 'choice')[0]).toContain('L 74 18');
    expect(paths(r, 'choice')[0]).toBe(
      'M 0 40 A 10 10 0 0 0 10 30 L 10 28 A 10 10 0 0 1 20 18 L 74 18'
    );
  });

  it('connects centered choice alternatives to the right lane before merging', () => {
    const r = rule('identifierPart = choice(nonterminal("letter"), terminal("_")) ;');
    const terminal = find(r, 'terminal')!;
    expect([terminal.x, terminal.y]).toEqual([40, 44]);
    const exit = paths(r, 'choice').find((d) => d.startsWith('M 68 62'));
    expect(exit).toContain('L 88 62');
    expect(exit).toContain('L 98 50');
    expect(exit).toBe('M 68 62 L 88 62 A 10 10 0 0 0 98 52 L 98 50 A 10 10 0 0 1 108 40');
  });

  it('orients choice corner arcs in the direction of travel', () => {
    const choicePaths = paths(rule('sign = choice(terminal("+"), terminal("-")) ;'), 'choice');
    expect(choicePaths[0]).toContain('A 10 10 0 0 0 10 30');
    expect(choicePaths[0]).toContain('A 10 10 0 0 1 20 18');
    expect(choicePaths[1]).toContain('A 10 10 0 0 1 58 28');
    expect(choicePaths[1]).toContain('A 10 10 0 0 0 68 40');
    expect(choicePaths[2]).toContain('A 10 10 0 0 1 10 50');
    expect(choicePaths[2]).toContain('A 10 10 0 0 0 20 62');
    expect(choicePaths[3]).toContain('A 10 10 0 0 0 58 52');
    expect(choicePaths[3]).toContain('A 10 10 0 0 1 68 40');
    expect(choicePaths).toEqual([
      'M 0 40 A 10 10 0 0 0 10 30 L 10 28 A 10 10 0 0 1 20 18 L 20 18',
      'M 48 18 L 48 18 A 10 10 0 0 1 58 28 L 58 30 A 10 10 0 0 0 68 40',
      'M 0 40 A 10 10 0 0 1 10 50 L 10 52 A 10 10 0 0 0 20 62 L 20 62',
      'M 48 62 L 48 62 A 10 10 0 0 0 58 52 L 58 50 A 10 10 0 0 1 68 40',
    ]);
  });

  it('orients repetition loop corners in the direction of travel', () => {
    const repetitionPaths = paths(rule('number = oneOrMore(nonterminal("digit")) ;'), 'repetition');
    const loopPath = repetitionPaths.find((d) => d.includes('L 90 46'));
    expect(loopPath).toBe(
      'M 80 18 A 10 10 0 0 1 90 28 L 90 46 A 10 10 0 0 1 80 56 L 20 56 A 10 10 0 0 1 10 46 L 10 28 A 10 10 0 0 1 20 18'
    );
    expect(repetitionPaths).toEqual(['M 0 18 L 20 18', 'M 80 18 L 100 18', loopPath]);
  });
});

describe('v12 geometry', () => {
  it('lays a rule out as v12 did: label, markers, lead lines, size', () => {
    // `x =` is 24 px: start marker at 44, definition at 64, 68 wide, end marker at 142.
    const r = rule('x = nonterminal("abcdef") ;');
    expect(r.label).toMatchObject({ text: 'x =', x: 0, y: 20, anchor: 'start' });
    expect(r.baseline).toBe(20);
    expect(r.start).toEqual({ cx: 44, cy: 20, r: 5 });
    expect(r.end).toEqual({ cx: 142, cy: 20, r: 5 });
    expect([r.definition.x, r.definition.y]).toEqual([64, 2]);
    expect(v12Path(r.leadIn)).toBe('M 49 20 L 64 20');
    expect(v12Path(r.leadOut)).toBe('M 132 20 L 137 20');
    expect([r.width, r.height]).toEqual([147, 58]);
    expect(r.definition.box).toEqual({ x: 0, y: 0, width: 68, height: 36, cornerRadius: 0 });
    expect(r.definition.text).toMatchObject({ text: 'abcdef', x: 34, y: 18, anchor: 'middle' });
  });

  it('gives terminals the fixed corner radius and specials their dashed `? t ?` box', () => {
    const layout = lay('railroad-beta\na = sequence(terminal("t"), special("s")) ;\n');
    const [t, s] = layout.rules[0]!.definition.children;
    expect(t!.box).toMatchObject({ cornerRadius: 10, width: 28 });
    expect(s!.text!.text).toBe('? s ?');
    expect(s!.box).toMatchObject({ cornerRadius: 0, dash: [5, 3], width: 60 });
  });

  it('joins a sequence on its tallest element’s track', () => {
    const r = rule('a = sequence(terminal("x"), choice(terminal("p"), terminal("q"))) ;');
    const seq = r.definition;
    expect(seq.up).toBe(40);
    expect(seq.children.map((c) => [c.x, c.y])).toEqual([
      [0, 22],
      [38, 0],
    ]);
    expect(seq.paths.map(v12Path)).toEqual(['M 28 40 L 38 40']);
  });

  it('draws an optional with its bypass 2r above the element', () => {
    const r = rule('a = optional(terminal("x")) ;');
    expect(r.definition).toMatchObject({ width: 68, up: 38, down: 18 });
    expect(paths(r, 'optional')).toEqual([
      'M 0 38 L 20 38',
      'M 48 38 L 68 38',
      'M 0 38 A 10 10 0 0 0 10 28 L 10 10 A 10 10 0 0 1 20 0 L 48 0 A 10 10 0 0 1 58 10 L 58 28 A 10 10 0 0 0 68 38',
    ]);
  });

  it('draws zeroOrMore with a loop below and a bypass above; max is never drawn', () => {
    const r = rule('a = zeroOrMore(terminal("x")) ;');
    expect(r.definition).toMatchObject({ width: 68, up: 38, down: 38 });
    expect(paths(r, 'repetition')).toHaveLength(4);
    const abnf = lay('railroad-abnf-beta\na = 3*5"x" ;\nb = 1*"x" ;\n');
    const [bounded, plus] = abnf.rules.map((x) => x.definition);
    expect(bounded!.paths.map(v12Path)).toEqual(plus!.paths.map(v12Path));
  });

  it('keeps a branch on the main line straight', () => {
    const r = rule('d = choice(terminal("0"), terminal("1"), terminal("2")) ;');
    expect(paths(r, 'choice').slice(2, 4)).toEqual(['M 0 62 L 20 62', 'M 48 62 L 68 62']);
  });

  it('draws 200 × 100 and nothing else with no rules', () => {
    const layout = lay('railroad-beta\n');
    expect(layout).toMatchObject({ width: 200, height: 100, rules: [] });
    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('starts rules at padding and stacks them verticalSeparation apart', () => {
    const layout = lay('railroad-beta\na = terminal("x") ;\nb = terminal("y") ;\n', {
      padding: 4,
      verticalSeparation: 30,
    });
    // Rule height max(40, 2 + 24 + 8) = 40; terminals are 24 high with padding 4.
    expect(layout.rules.map((r) => r.origin)).toEqual([
      { x: 0, y: 4 },
      { x: 0, y: 74 },
    ]);
    expect(layout.height).toBe(74 + 40 + 30 + 4);
  });
});

describe('D514', () => {
  it('measures rule names bold, as they are drawn', () => {
    const layout = lay('railroad-beta\nsign = terminal("+") ;\n', {}, boldMeasurer);
    const r = layout.rules[0]!;
    expect(layout.fonts.ruleName.weight).toBe(700);
    expect(layout.fonts.text.weight).toBe(400);
    // `sign =` is 6 bold characters, 54 px (v12 measured 48 at normal weight).
    expect(r.label.box.width).toBe(54);
    expect(r.start.cx).toBe(74);
    expect(r.definition.x).toBe(94);
  });

  it('moves a choice branch closer than 2r to the main line out to 2r', () => {
    // arcRadius 20: v12 put the branches 22 px from the main line, and its vertical pieces ran
    // backwards (`A … 20 20 L 20 38`). Each side moves out by 18: main line at 58, height 116.
    const r = rule('sign = choice(terminal("+"), terminal("-")) ;', { arcRadius: 20 });
    const choice = find(r, 'choice')!;
    expect([choice.up, choice.down]).toEqual([58, 58]);
    expect(choice.children.map((c) => c.y)).toEqual([0, 80]);
    expect(choice.paths.map(v12Path)).toEqual([
      'M 0 58 A 20 20 0 0 0 20 38 L 20 38 A 20 20 0 0 1 40 18 L 40 18',
      'M 68 18 L 68 18 A 20 20 0 0 1 88 38 L 88 38 A 20 20 0 0 0 108 58',
      'M 0 58 A 20 20 0 0 1 20 78 L 20 78 A 20 20 0 0 0 40 98 L 40 98',
      'M 68 98 L 68 98 A 20 20 0 0 0 88 78 L 88 78 A 20 20 0 0 1 108 58',
    ]);
  });

  it('moves only the side that is too close, and every branch beyond it', () => {
    // v12: tops 0, 44, 88 (36, 36 and a 56 high optional), main line at 72, tracks at 18, 62
    // and 126: the middle branch is 10 above the main line. The main line moves down 10, the
    // branches on and below it with it; the branches above stay.
    const r = rule('c = choice(terminal("a"), terminal("b"), optional(terminal("c"))) ;');
    const choice = find(r, 'choice')!;
    expect([choice.up, choice.down]).toEqual([82, 72]);
    expect(choice.children.map((c) => c.y)).toEqual([0, 44, 98]);
    expect(choice.paths.map(v12Path)[2]).toBe(
      'M 0 82 A 10 10 0 0 0 10 72 L 10 72 A 10 10 0 0 1 20 62 L 40 62'
    );
  });

  it('keeps an optional’s bypass at 2r unless verticalSeparation is larger', () => {
    expect(rule('a = optional(terminal("x")) ;', { verticalSeparation: 30 }).definition.up).toBe(
      48
    );
    expect(rule('a = optional(terminal("x")) ;', { verticalSeparation: 20 }).definition.up).toBe(
      38
    );
    const rep = rule('a = oneOrMore(terminal("x")) ;', { verticalSeparation: 30 }).definition;
    expect([rep.up, rep.down]).toEqual([18, 48]);
  });
});

describe('config and fonts', () => {
  it('reads the lengths as v12 did: numbers, parseFloat strings, else the default', () => {
    expect(railroadLayoutConfig(undefined)).toEqual(RAILROAD_LAYOUT_DEFAULTS);
    expect(
      railroadLayoutConfig({
        padding: '12px',
        arcRadius: -1,
        markerRadius: 'big',
        strokeWidth: 0,
        verticalSeparation: Number.NaN,
        horizontalSeparation: 3,
      })
    ).toEqual({
      padding: 12,
      verticalSeparation: 8,
      horizontalSeparation: 3,
      arcRadius: 10,
      markerRadius: 5,
      strokeWidth: 0,
    });
  });

  it('measures at the railroad font where set, else the theme’s', () => {
    const seen: FontKey[] = [];
    const recording: Measurer = {
      id: 'recording',
      width: (text, font) => (seen.push(font), text.length * 8),
      metrics: () => ({ ascent: 12, descent: 4, lineHeight: 16 }),
    };
    const src = 'railroad-beta\na = terminal("x") ;\n';
    const { model } = parseRailroad(src);
    layoutRailroad(model, context({}, recording));
    expect(new Set(seen.map((f) => `${f.family} ${f.size} ${f.weight}`))).toEqual(
      new Set(['monospace 16 400', 'monospace 16 700'])
    );
    seen.length = 0;
    const layout = layoutRailroad(
      model,
      context({ fontFamily: ' serif ', fontSize: '20px' }, recording)
    );
    expect(layout.fonts.text).toEqual({ family: 'serif', size: 20, weight: 400 });
    expect(new Set(seen.map((f) => `${f.family} ${f.size}`))).toEqual(new Set(['serif 20']));
    expect(
      layoutRailroad(model, context({ fontFamily: '', fontSize: 0 }, recording)).fonts.text
    ).toEqual({ family: 'monospace', size: 16, weight: 400 });
  });

  it('grows the bounds over a rule name taller than its rule’s top', () => {
    const layout = lay('railroad-beta\na = terminal("x") ;\n', { fontSize: 100 }, boldMeasurer);
    // The terminal is 120 high (up 60), so the baseline is 60 below the rule's top at y 10; the
    // name's ascent is 75.
    expect(layout.bounds.y).toBeLessThan(0);
  });
});
