import { beforeAll, describe, expect, it } from 'vitest';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import {
  legendViolations,
  c4TestConfig,
  c4TestContext,
  layoutC4BetaFull,
  parseC4Beta,
  type C4BetaModel,
} from '@mermaid-js/diagram-c4/testing';
import type { C4Layout, Rect } from '@mermaid-js/diagram-c4';
import { c4betaSources } from './corpus.ts';
import {
  allViolations,
  containmentViolations,
  crossingViolations,
  headerBox,
  labelViolations,
  titleViolations,
} from './layout-checks.ts';

/**
 * The c4-beta layout (spec #730 §Layout, §Testing Decisions) on parser-produced sources: the
 * invariants hold on every accepted probe and the grammar's two documents in all four
 * directions; the two cases where v12's layout did badly are pinned; `direction` orders the
 * ranks along the right axis and sign; a layout is deterministic and leaves the model alone.
 */
let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
});

const DIRECTIONS = ['TB', 'BT', 'LR', 'RL'] as const;
type Direction = (typeof DIRECTIONS)[number];

function laidOut(source: string, direction?: Direction) {
  const { model, diagnostics } = parseC4Beta(source);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const set: C4BetaModel = direction ? { ...model, direction } : model;
  return { model: set, run: layoutC4BetaFull(set, c4TestContext(c4TestConfig(), theme)) };
}

/** Every source that parses without an error: the accepted probes and the grammar's documents. */
const accepted = c4betaSources().filter(
  ({ source }) => !parseC4Beta(source).diagnostics.some((d) => d.severity === 'error')
);

describe('the invariants hold on every accepted source in every direction', () => {
  it('reads the accepted probes and the two grammar documents', () => {
    expect(accepted.map((a) => a.id)).toEqual(expect.arrayContaining(['b02-basic-context.mmd']));
    expect(accepted.length).toBeGreaterThanOrEqual(20);
  });

  it.each(DIRECTIONS)('direction %s: engine, crossings, labels, headers, containment', (d) => {
    const failures: string[] = [];
    for (const { id, source } of accepted) {
      const { model, run } = laidOut(source, d);
      const all = [...allViolations(model, run), ...titleViolations(run.scene)];
      failures.push(...all.map((v) => `${id}: ${v}`));
    }
    expect(failures).toEqual([]);
  });
});

describe('the invariants hold with the type lines hidden (T5)', () => {
  const configs = {
    'hideStereotypes: [person]': { hideStereotypes: ['person'] },
    'showStereotypes: false': { showStereotypes: false },
    'personWrappingWidth: 40': { personWrappingWidth: 40 },
    'personWrappingWidth: 120': { personWrappingWidth: 120 },
    'personWrappingWidth: 1000 (wider than the shape)': { personWrappingWidth: 1000 },
  } as const;

  it.each(Object.entries(configs))(
    '%s: engine, crossings, labels, headers, containment',
    (_, c4beta) => {
      const failures: string[] = [];
      for (const { id, source } of accepted) {
        const { model } = laidOut(source);
        const config = c4TestConfig(undefined, { c4beta }, true);
        const run = layoutC4BetaFull(model, c4TestContext(config, theme));
        const all = [...allViolations(model, run), ...titleViolations(run.scene)];
        failures.push(...all.map((v) => `${id}: ${v}`));
      }
      expect(failures).toEqual([]);
    }
  );
});

describe('the legend (T3) lies inside the bounds and over nothing, on every accepted source', () => {
  it.each(DIRECTIONS)('direction %s, with the legend on', (d) => {
    const failures: string[] = [];
    let legends = 0;
    for (const { id, source } of accepted) {
      const { model: parsed } = laidOut(source, d);
      const model: C4BetaModel = { ...parsed, legend: true };
      const run = layoutC4BetaFull(model, c4TestContext(c4TestConfig(), theme));
      if (run.scene.legend) legends++;
      failures.push(...allViolations(model, run).map((v) => `${id}: ${v}`));
    }
    expect(legends).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
  });

  it('draws no legend, and the same scene, with `legend off`', () => {
    for (const { id, source } of accepted) {
      const { model } = laidOut(source);
      const off = layoutC4BetaFull(
        { ...model, legend: false },
        c4TestContext(c4TestConfig(), theme)
      );
      expect(off.scene.legend, id).toBeUndefined();
    }
  });

  it('is found overlapping an element, a relation, a label, or outside the bounds', () => {
    const { model: parsed } = laidOut(
      'c4-beta container\nperson a "A"\nsoftwareSystem s "S" {\n  container c "C"\n}\na --> c : "Uses"\n',
      'TB'
    );
    const { scene } = layoutC4BetaFull(
      { ...parsed, legend: true },
      c4TestContext(c4TestConfig(), theme)
    );
    const legend = scene.legend!;
    expect(legendViolations(scene)).toEqual([]);
    const at = (box: Rect) => ({ ...scene, legend: { ...legend, box } });
    const element = scene.elements[0]!.box;
    const label = scene.relations[0]!.labelBox!;
    const line = scene.relations[0]!.points[0]!;
    const inLine = { ...legend.box, x: line.x - 1, y: line.y - 1, width: 2, height: 2 };
    expect(legendViolations(at({ ...legend.box, ...element }))).not.toEqual([]);
    expect(legendViolations(at({ ...legend.box, ...label }))).not.toEqual([]);
    expect(legendViolations(at(inLine))).not.toEqual([]);
    expect(
      legendViolations(at({ ...legend.box, y: scene.bounds.y + scene.bounds.height }))
    ).toContain('the legend is outside the bounds');
  });
});

describe('the checks fail on a layout that breaks the rule they state', () => {
  const base = () => laidOut(source('relation passing the box between'), 'TB');
  const source = (_: string): string =>
    'c4-beta container\nperson a "A"\nsoftwareSystem s "S" {\n  container c "C"\n}\na --> c : "Uses"\n';
  const moveLabelOnto = (scene: C4Layout, box: Rect): C4Layout => ({
    ...scene,
    relations: scene.relations.map((r) => ({ ...r, labelBox: { ...box } })),
  });

  it('a label over an element', () => {
    const { run } = base();
    const element = run.scene.elements[0]!;
    expect(labelViolations(run.scene)).toEqual([]);
    expect(labelViolations(moveLabelOnto(run.scene, element.box))).not.toEqual([]);
  });

  it('a label over a boundary header', () => {
    const { run } = base();
    const header = headerBox(run.scene.boundaries[0]!)!;
    expect(labelViolations(moveLabelOnto(run.scene, header))).not.toEqual([]);
  });

  it('a relation through an element and through a title', () => {
    const { run } = base();
    const through = run.scene.elements.find((e) => e.alias === 'a');
    const header = headerBox(run.scene.boundaries[0]!)!;
    const across = (x: number, y: number, to: number) => ({
      ...run.scene,
      relations: run.scene.relations.map((r) => ({
        ...r,
        from: 'x',
        to: 'y',
        points: [
          { x, y },
          { x, y: to },
        ],
      })),
    });
    const box = through!.box;
    expect(
      crossingViolations(across(box.x + box.width / 2, box.y - 10, box.y + box.height + 10))
    ).not.toEqual([]);
    expect(
      titleViolations(
        across(header.x + header.width / 2, header.y - 5, header.y + header.height + 5)
      )
    ).not.toEqual([]);
  });

  it('an element outside its boundary', () => {
    const { model, run } = base();
    const elements = run.scene.elements.map((e) =>
      e.alias === 'c' ? { ...e, box: { ...e.box, x: e.box.x + 10_000 } } : e
    );
    expect(containmentViolations(model, { ...run.scene, elements })).not.toEqual([]);
  });
});

/** Case 1: a person, two systems and an external system, five relations, one of them long. */
const CONTEXT = [
  'c4-beta context',
  'person user "Customer" "Buys things."',
  'softwareSystem shop "Shop" "Takes orders."',
  'softwareSystem bank "Bank" "Holds the money."',
  'softwareSystem mail "Mail provider" "Sends mail." :::external',
  'user --> shop : "Orders through" "HTTPS"',
  'shop --> bank : "Charges cards with" "JSON"',
  'bank --> mail : "Sends statements with" "SMTP"',
  'shop --> mail : "Sends receipts with" "SMTP"',
  'user --> mail : "Reads receipts from" "IMAP"',
].join('\n');

/** Case 2: relations into the children of a boundary, which they enter through its title. */
const titled = (title: string): string =>
  [
    'c4-beta container',
    'person p "Payer"',
    `softwareSystem payments "${title}" "Holds the ledger." {`,
    '  container api "API" "Serves." "Kotlin"',
    '  container db "Ledger" "Stores." "Postgres"',
    '}',
    'softwareSystem audit "Audit" "Watches."',
    'p --> api : "Pays" "HTTPS"',
    'api --> db : "Writes" "SQL"',
    'p --> audit : "Is watched by"',
    'audit --> db : "Reads" "SQL"',
  ].join('\n');
const TITLED = titled('Payments platform');
/** A title wider than the stretch between the two relations that enter the frame under it. */
const TITLED_LONG = titled('Payments platform with a rather long title');

/**
 * Expected failure: in TB, two relations enter `payments` at 179 and 337 px, and its long title
 * (about 300 px) fits between neither them nor the frame's sides, so the header cannot slide
 * clear. The other directions enter by a side of the frame and are clean.
 */
const KNOWN_TITLE_CROSSINGS = [
  'p -> api crosses the title of payments',
  'audit -> db crosses the title of payments',
];

describe('where the layered engine did badly on C4 in v12', () => {
  it.each(DIRECTIONS)(
    'a context diagram of five relations, one long: no label hides behind a node (%s)',
    (d) => {
      const { run } = laidOut(CONTEXT, d);
      const { scene } = run;
      expect(scene.relations).toHaveLength(5);
      const long = scene.relations.find((r) => r.from === 'user' && r.to === 'mail')!;
      // The long relation spans more than one rank, so its line is longer than any other's.
      const length = (r: typeof long) =>
        r.points
          .slice(1)
          .reduce(
            (n, p, i) => n + Math.abs(p.x - r.points[i]!.x) + Math.abs(p.y - r.points[i]!.y),
            0
          );
      expect(scene.relations.every((r) => r === long || length(r) < length(long))).toBe(true);
      expect(scene.relations.every((r) => r.labelBox !== undefined)).toBe(true);
      expect(labelViolations(scene)).toEqual([]);
      expect(crossingViolations(scene)).toEqual([]);
    }
  );

  it.each(DIRECTIONS)('a relation that enters a boundary does not cross its title (%s)', (d) => {
    const { run } = laidOut(TITLED, d);
    const { scene } = run;
    expect(scene.boundaries).toHaveLength(1);
    const frame = scene.boundaries[0]!;
    expect(titleViolations(scene)).toEqual([]);
    // The header stays inside its frame.
    const header = headerBox(frame)!;
    expect(header.x).toBeGreaterThanOrEqual(frame.box.x);
    expect(header.x + header.width).toBeLessThanOrEqual(frame.box.x + frame.box.width);
    expect(labelViolations(scene)).toEqual([]);
  });

  it('TB: the title slides off the middle for the relations that enter there', () => {
    const { run } = laidOut(TITLED, 'TB');
    const frame = run.scene.boundaries[0]!;
    const header = headerBox(frame)!;
    const middle = frame.box.x + frame.box.width / 2;
    expect(Math.abs(header.x + header.width / 2 - middle)).toBeGreaterThan(1);
  });

  it.each(['BT', 'LR', 'RL'] as const)('a long title is not crossed (%s)', (d) => {
    expect(titleViolations(laidOut(TITLED_LONG, d).run.scene)).toEqual([]);
  });

  it('TB: a title too wide to slide clear is crossed by the relations pinned above', () => {
    expect(titleViolations(laidOut(TITLED_LONG, 'TB').run.scene)).toEqual(KNOWN_TITLE_CROSSINGS);
  });

  // Expected failure (see KNOWN_TITLE_CROSSINGS): the wanted behaviour, flipped when it holds.
  it.fails('TB: a long title is not crossed either', () => {
    expect(titleViolations(laidOut(TITLED_LONG, 'TB').run.scene)).toEqual([]);
  });
});

describe('direction', () => {
  const CHAIN =
    'c4-beta container\nperson a "A"\ncontainer b "B"\ncontainer c "C"\na --> b\nb --> c\n';
  const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const at = (scene: C4Layout, id: string) =>
    centre(scene.elements.find((e) => e.alias === id)!.box);

  it.each([
    ['TB', 'y', 1],
    ['BT', 'y', -1],
    ['LR', 'x', 1],
    ['RL', 'x', -1],
  ] as const)('%s runs a chain along %s, sign %i', (d, axis, sign) => {
    const { run } = laidOut(CHAIN, d);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => at(run.scene, id)[axis]);
    expect(sign * (b! - a!)).toBeGreaterThan(0);
    expect(sign * (c! - b!)).toBeGreaterThan(0);
    // The other axis stays put: the chain is one line.
    const cross = axis === 'y' ? 'x' : 'y';
    expect(Math.abs(at(run.scene, 'a')[cross] - at(run.scene, 'c')[cross])).toBeLessThan(1);
  });

  it("the model's own direction is the default, and TB when it gives none", () => {
    expect(laidOut(CHAIN).model.direction).toBe('TB');
    const { run } = laidOut(CHAIN.replace('\nperson', '\ndirection RL\nperson'));
    expect(at(run.scene, 'b').x).toBeLessThan(at(run.scene, 'a').x);
  });

  it('every relation between two elements runs the same way in all four directions', () => {
    const along = {
      TB: (dx: number, dy: number) => dy,
      BT: (dx: number, dy: number) => -dy,
      LR: (dx: number) => dx,
      RL: (dx: number) => -dx,
    };
    const failures: string[] = [];
    for (const { id, source } of accepted) {
      const scenes = DIRECTIONS.map((d) => ({ d, scene: laidOut(source, d).run.scene }));
      const { scene: tb } = scenes[0]!;
      for (const rel of tb.relations) {
        if (rel.from === rel.to) continue;
        const signs = scenes.map(({ d, scene }) => {
          const from = scene.elements.find((e) => e.alias === rel.from);
          const to = scene.elements.find((e) => e.alias === rel.to);
          if (!from || !to) return 0;
          const a = centre(from.box);
          const b = centre(to.box);
          return Math.sign(Math.round(along[d](b.x - a.x, b.y - a.y)));
        });
        if (new Set(signs.filter((s) => s !== 0)).size > 1)
          failures.push(`${id}: ${rel.from} -> ${rel.to} runs ${signs.join(',')}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('determinism', () => {
  it.each(accepted.map((a) => [a.id, a.source] as const))(
    '%s: two runs agree and the model is untouched',
    (_id, source) => {
      for (const d of DIRECTIONS) {
        const { model } = laidOut(source, d);
        const before = structuredClone(model);
        const ctx = c4TestContext(c4TestConfig(), theme);
        const one = layoutC4BetaFull(model, ctx);
        const two = layoutC4BetaFull(model, ctx);
        expect(two.scene).toEqual(one.scene);
        expect(two.prepared.graph).toEqual(one.prepared.graph);
        expect(model).toEqual(before);
      }
    }
  );
});

describe('boundaries', () => {
  it('nest to any depth: each frame holds its children below its header', () => {
    const src = [
      'c4-beta deployment',
      'deploymentNode a "A" {',
      '  deploymentNode b "B" {',
      '    deploymentNode c "C" {',
      '      container leaf "Leaf" "Deep." "Go"',
      '    }',
      '  }',
      '}',
      'person who "Who"',
      'who --> leaf : "Uses"',
    ].join('\n');
    const { model, run } = laidOut(src, 'TB');
    expect(run.scene.boundaries.map((b) => [b.alias, b.parent, b.depth])).toEqual([
      ['a', -1, 0],
      ['b', 0, 1],
      ['c', 1, 2],
    ]);
    expect(allViolations(model, run)).toEqual([]);
    expect(titleViolations(run.scene)).toEqual([]);
  });

  it('draw an empty group as a frame round its title', () => {
    const { run } = laidOut('c4-beta context\ngroup g "Nothing here yet"\n', 'TB');
    const frame = run.scene.boundaries[0]!;
    const header = headerBox(frame)!;
    expect(frame.box.width).toBeGreaterThan(header.width);
    expect(frame.box.height).toBeGreaterThanOrEqual(frame.head);
  });

  it('take a relation to a boundary and from one', () => {
    const src =
      'c4-beta container\nsoftwareSystem s1 "S1" {\n  container a "A"\n}\nsoftwareSystem s2 "S2" {\n  container b "B"\n}\nperson p "P"\ns1 --> s2 : "Settles"\np --> s1 : "Visits"\n';
    for (const d of DIRECTIONS) {
      const { model, run } = laidOut(src, d);
      expect(run.scene.relations.map((r) => [r.from, r.to])).toEqual([
        ['s1', 's2'],
        ['p', 's1'],
      ]);
      expect(allViolations(model, run)).toEqual([]);
    }
  });
});
