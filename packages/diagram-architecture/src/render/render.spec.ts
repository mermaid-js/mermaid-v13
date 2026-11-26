import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@mermaid-js/core';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { assertInert } from '@mermaid-js/core/svg';
import { ARCHITECTURE_ARROW_SHRUNK } from '../codes.ts';
import { architectureIcons, architectureLabels } from '../icons.ts';
import { gridMeasurer, modelOf } from '../layout/fixtures.ts';
import { architecture } from '../plugin.ts';
import { renderArchitectureForTest as render, type RenderArchitectureOptions } from './harness.ts';
import { ICON_NOT_RENDERED } from './assets.ts';
import { arrowhead } from './edges.ts';

/** Every 10 px wide, lines 20 px high: lengths below are worked out by hand from it. */
const grid: RenderArchitectureOptions = { measurer: gridMeasurer };
const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);
const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;
/** The attributes of the first element matching `re` (whose first group is its attribute text). */
const attrs = (svg: string, re: RegExp): Record<string, string> => {
  const m = re.exec(svg);
  if (!m) throw new Error(`no match for ${String(re)}`);
  return Object.fromEntries(
    [...m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a): [string, string] => [a[1]!, a[2]!])
  );
};
const numbers = (s: string) => s.split(/[ ,]+/).map(Number);

const PAIR = 'architecture-beta\n  service a(server)[A]\n  service b(database)[B]\n';

describe('structure (D508, v12 class names and order)', () => {
  const SOURCE = `architecture-beta
  title Not drawn
  accTitle: Access title
  accDescr: Access description
  group g(cloud)[Group]
  service a(server)[A] in g
  service b(disk)[B] in g
  junction j
  a:R --> L:b
  b:B -- T:j
`;

  it('draws edges, then services and junctions, then groups, with v12 class names', async () => {
    const { svg } = await render(SOURCE, grid);
    const order = [...svg.matchAll(/class="(architecture-[a-z-]+)"/g)].map((m) => m[1]);
    const sections = order.filter((c) => c!.endsWith('s'));
    expect(sections).toEqual([
      'architecture-edges',
      'architecture-services',
      'architecture-groups',
    ]);
    const services = svg.slice(svg.indexOf('architecture-services'));
    expect(services.indexOf('architecture-service"')).toBeLessThan(
      services.indexOf('architecture-junction"')
    );
    expect(count(svg, /class="edge"/g)).toBe(2);
    expect(count(svg, /class="arrow"/g)).toBe(1);
    expect(count(svg, /<rect class="node-bkg"/g)).toBe(1);
    assertInert(svg);
  });

  it('puts one data-ast per service, junction, group and edge, and data-id only on labels', async () => {
    const r = await render(SOURCE, grid);
    const asts = [...r.svg.matchAll(/data-ast="([^"]+)"/g)].map((m) => m[1]!.replace('&gt;', '>'));
    expect(asts.sort()).toEqual(
      ['edge:a->b', 'edge:b->j', 'group:g', 'junction:j', 'service:a', 'service:b'].sort()
    );
    for (const m of r.svg.matchAll(/<g class="architecture-service-label"([^>]*)>/g)) {
      expect(m[1]).toContain('data-id=');
      expect(m[1]).not.toContain('data-ast');
    }
    // `g` for nodes and groups, `path.edge` for edges.
    for (const m of r.svg.matchAll(/<(\w+) class="([^"]+)"[^>]*data-ast=/g))
      expect([
        'g architecture-service',
        'g architecture-junction',
        'g architecture-group',
        'path edge',
      ]).toContain(`${m[1]} ${m[2]}`);
  });

  it('writes no element id but the title and description, and never draws the title (D218)', async () => {
    const { svg } = await render(SOURCE, { ...grid, idPrefix: 'p1' });
    expect([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])).toEqual(['p1-title', 'p1-desc']);
    expect(svg).toContain('aria-labelledby="p1-title"');
    expect(svg).toContain('aria-describedby="p1-desc"');
    expect(svg).toContain('aria-roledescription="architecture"');
    expect(svg).not.toContain('Not drawn');
  });

  it('draws a junction as v12 did: an invisible iconSize box', async () => {
    const { svg } = await render(SOURCE, grid);
    expect(svg).toMatch(
      /<g class="architecture-junction" data-id="junction:j" data-ast="junction:j" transform="translate\([\d.]+,[\d.]+\)"><rect width="80" height="80" fill-opacity="0"\/><\/g>/
    );
  });

  it('draws a service with neither icon nor text in v12 dashed outline', async () => {
    const { svg } = await render('architecture-beta\n  service a[A]\n', grid);
    const outline = attrs(svg, /<path class="node-bkg"([^>]*)\/>/);
    expect(outline.d).toBe('M0,80L0,5Q0,0 5,0L75,0Q80,0 80,5L80,80Z');
    expect(outline['stroke-dasharray']).toBe('8');
    expect(outline.fill).toBe('none');
  });

  it('honours architecture.useMaxWidth', async () => {
    const wide = await render(PAIR, grid);
    expect(wide.svg).toMatch(/<svg[^>]* width="100%"[^>]*style="max-width:/);
    const fixed = await render(PAIR, { ...grid, config: { architecture: { useMaxWidth: false } } });
    expect(fixed.svg).toMatch(/<svg[^>]* width="\d+" height="\d+"/);
  });
});

describe('icons (D505, D506)', () => {
  it('draws the seven built-ins as v12 did, with no extension and no warning', async () => {
    const names = ['database', 'server', 'disk', 'internet', 'cloud', 'blank', 'unknown'];
    const src = `architecture-beta\n${names.map((n) => `  service s${n}(${n})[${n}]`).join('\n')}\n`;
    const r = await render(src, grid);
    expect(codes(r)).toEqual([]);
    expect(count(r.svg, /<rect width="80" height="80" fill="#087ebf" stroke-width="0"\/>/g)).toBe(
      7
    );
    // v12's `?` (`unknownIcon`), only for `unknown`.
    expect(count(r.svg, />\?<\/text>/g)).toBe(1);
    expect(r.svg).toContain(
      '<text x="21.16" y="64.67" fill="#fff" font-family="ArialMT, Arial" font-size="67.75px">?</text>'
    );
    assertInert(r.svg);
  });

  it('scales the built-ins to architecture.iconSize', async () => {
    const r = await render(PAIR, { ...grid, config: { architecture: { iconSize: 40 } } });
    expect(count(r.svg, /<g transform="scale\(0\.5,0\.5\)"><rect width="80"/g)).toBe(2);
  });

  it('draws an unknown name as the ? square with one ICON_NOT_RENDERED naming each', async () => {
    const r = await render(
      'architecture-beta\n  group g(nope)[G]\n  service a(bogus)[A] in g\n  service b(aws:lambda)[B]\n',
      grid
    );
    expect(count(r.svg, />\?<\/text>/g)).toBe(3);
    expect(codes(r)).toEqual([ICON_NOT_RENDERED]);
    expect(r.warnings[0]!.message).toContain('"bogus", "aws:lambda", "nope"');
  });

  it('asks the extensions for every non-built-in name at its size, and draws their glyph', async () => {
    const asked: [string, number][] = [];
    const icon = ((name: string, size: number) => {
      asked.push([name, size]);
      return name === 'bogus'
        ? undefined
        : { tag: 'rect', attrs: { class: 'glyph', width: size, height: size } };
    }) as RenderContext['icon'];
    const r = await render(
      'architecture-beta\n  group g(logos:aws)[G]\n  service a(logos:aws)[A] in g\n  service b(server)[B] in g\n  service c(bogus)[C] in g\n',
      { ...grid, icon }
    );
    // Services are drawn before groups (v12's order).
    expect(asked).toEqual([
      ['logos:aws', 80],
      ['bogus', 80],
      ['logos:aws', 30],
    ]);
    expect(count(r.svg, /class="glyph"/g)).toBe(2);
    expect(codes(r)).toEqual([ICON_NOT_RENDERED]);
  });

  it('leaves the warning to the extension that reported a name unresolved (null)', async () => {
    const r = await render('architecture-beta\n  service a(logos:nope)[A]\n', {
      ...grid,
      icon: (() => null) as RenderContext['icon'],
    });
    expect(count(r.svg, />\?<\/text>/g)).toBe(1);
    expect(codes(r)).toEqual([]);
  });

  it('lists non-built-in icons, once each, as the icons hook (D505), and every label text', () => {
    const model = modelOf(
      'architecture-beta\n  group g(logos:aws)[G]\n  service a(logos:aws)[A] in g\n  service b(server)[B #amp; C]\n  service c "txt"[C]\n  a:R -[e]- L:b\n'
    );
    const listed = [{ name: 'logos:aws', fallbackPrefix: 'mermaid-architecture' }];
    expect(architectureIcons(model)).toEqual(listed);
    expect(architecture.icons(model)).toEqual(listed);
    expect(architectureLabels(model)).toEqual(['G', 'A', 'B &amp; C', 'C', 'txt', 'e']);
  });

  it('lays a text icon out in white in the blank square, cut with an ellipsis (D506)', async () => {
    // 78 px of room: 7 characters a line, 3 lines of 20 px.
    const r = await render(
      'architecture-beta\n  service a "one two three four five six seven"[A]\n',
      grid
    );
    const text = /<text class="node-icon-text" fill="#fff"[^>]*>(.*?)<\/text>/.exec(r.svg)![1]!;
    const lines = [...text.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    expect(lines).toEqual(['one two', 'three', 'four…']);
    expect(r.svg).not.toContain('foreignObject');
  });

  it('breaks a word wider than the square, and cuts what does not fit', async () => {
    const lines = async (text: string) => {
      const r = await render(`architecture-beta\n  service a "${text}"[A]\n`, grid);
      const t = /<text class="node-icon-text"[^>]*>(.*?)<\/text>/.exec(r.svg)![1]!;
      return [...t.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    };
    expect(await lines('abcdefghijklmnop')).toEqual(['abcdefg', 'hijklmn', 'op']);
    expect(await lines('abcdefghijklmnopqrstuvwxyz')).toEqual(['abcdefg', 'hijklmn', 'opqrst…']);
  });
});

describe('edges (D507)', () => {
  it('draws v12 arrowheads at iconSize / 6 with their tip 2 px into the node', () => {
    // `architectureTypes.ts:36-48`: an L end at (100, 50), 12 across.
    expect(arrowhead('L', { x: 100, y: 50 }, 12)).toEqual([102, 50, 90, 56, 90, 44]);
    expect(arrowhead('R', { x: 100, y: 50 }, 12)).toEqual([98, 50, 110, 44, 110, 56]);
    expect(arrowhead('T', { x: 100, y: 50 }, 12)).toEqual([94, 40, 106, 40, 100, 52]);
    expect(arrowhead('B', { x: 100, y: 50 }, 12)).toEqual([100, 48, 106, 60, 94, 60]);
  });

  it('puts the heads on the ends the arrows name', async () => {
    const r = await render(`${PAIR}  a:R <--> L:b\n`, grid);
    const heads = [...r.svg.matchAll(/<polygon class="arrow"[^>]*points="([^"]+)"/g)].map((m) =>
      numbers(m[1]!)
    );
    expect(heads).toHaveLength(2);
    const path = numbers(
      attrs(r.svg, /<path class="edge"([^>]*)\/>/)
        .d!.replace(/[ML]/g, ' ')
        .trim()
    );
    const [sx, sy, ex] = [path[0]!, path[1]!, path[2]!];
    // Source end on `R`: v12's `R` triangle, tip 2 px left of the end.
    expect(heads[0]![0]).toBeCloseTo(sx - 2);
    expect(heads[0]![1]).toBeCloseTo(sy);
    expect(heads[0]![2]! - heads[0]![0]!).toBeCloseTo(80 / 6);
    expect(heads[1]![0]).toBeCloseTo(ex + 2);
    expect(codes(r)).toEqual([]);
  });

  it('runs a junction end on to its centre, and a {group} end not', async () => {
    const r = await render(
      'architecture-beta\n  service a(server)[A]\n  junction j\n  a:R -- L:j\n',
      grid
    );
    const j = r.layout.nodes.get('j')!;
    const d = attrs(r.svg, /<path class="edge"([^>]*)\/>/).d!;
    expect(d.endsWith(`L${String(j.x)},${String(j.y)}`)).toBe(true);
    const grouped = await render(
      'architecture-beta\n  group g\n  group h\n  service a(server)[A] in g\n  junction j in h\n  a{group}:R -- L:j{group}\n',
      grid
    );
    const end = grouped.layout.edges.get('edge:a->j')!.points.at(-1)!;
    const h = grouped.layout.groups.get('h')!;
    expect(end.x).toBeCloseTo(h.x - h.width / 2);
    const drawn = attrs(grouped.svg, /<path class="edge"([^>]*)\/>/).d!;
    expect(drawn.endsWith(`L${String(end.x)},${String(end.y)}`)).toBe(true);
  });

  it('runs a left or right end on to the icon where the label is wider', async () => {
    // A 20-character label: the box is 150 px wide (wrapped at 120), the icon 80.
    const r = await render(
      'architecture-beta\n  service a(server)[aaaaaaaaaa aaaaaaaaaa]\n  service b(server)[B]\n  a:R -- L:b\n',
      grid
    );
    const a = r.layout.nodes.get('a')!;
    expect(a.width).toBeGreaterThan(80);
    const start = numbers(
      attrs(r.svg, /<path class="edge"([^>]*)\/>/)
        .d!.slice(1)
        .split('L')[0]!
    );
    expect(start[0]).toBeCloseTo(a.x + 40);
  });

  it('places labels as v12: under a level line, turned up a vertical one, at 45° in a bend', async () => {
    const r = await render(
      `architecture-beta
  service a(server)[A]
  service b(server)[B]
  service c(server)[C]
  service d(server)[D]
  a:R -[x]- L:b
  a:B -[y]- T:c
  b:B -[z]- L:d
`,
      grid
    );
    const labels = [
      ...r.svg.matchAll(
        /<g class="architecture-service-label" data-id="(edge:[^"]+)"([^>]*)><text[^>]*x="([\d.]+)" y="([\d.]+)"/g
      ),
    ].map((m) => ({
      id: m[1]!.replace('&gt;', '>'),
      turn: m[2]!,
      x: Number(m[3]),
      y: Number(m[4]),
    }));
    const path = (id: string) => {
      const p = new RegExp(`data-ast="${id.replace('>', '&gt;')}" d="([^"]+)"`).exec(r.svg)![1]!;
      return p
        .slice(1)
        .split('L')
        .map((s) => numbers(s));
    };
    const [x, y, z] = labels;
    // Level: flat, under the midpoint: its middle 1em (the default theme's 14 px) down, so its
    // top 14 − 10 px down and its baseline 15 px under that.
    const ab = path('edge:a->b');
    expect(x!.turn).toBe('');
    expect(x!.x).toBeCloseTo((ab[0]![0]! + ab[1]![0]!) / 2);
    expect(x!.y).toBeCloseTo(ab[0]![1]! + 14 - 10 + 15);
    // Vertical: turned −90° about the midpoint.
    const ac = path('edge:a->c');
    const mid = (ac[0]![1]! + ac[1]![1]!) / 2;
    expect(y!.turn).toBe(` transform="rotate(-90,${String(ac[0]![0])},${String(mid)})"`);
    // Bend `B`/`L`: v12's factors (1, −1), turned 45°, inside the corner.
    const bd = path('edge:b->d');
    expect(bd).toHaveLength(3);
    expect(z!.turn).toMatch(/rotate\(45,/);
    expect(z!.x).toBeGreaterThan(bd[1]![0]!);
  });

  it('draws routes with more bends as compass routes them, the label flat where it put it', async () => {
    const r = await render(`${PAIR}  a:T -[up]- T:b\n`, grid);
    const route = r.layout.edges.get('edge:a->b')!;
    expect(route.points.length).toBeGreaterThan(3);
    const label =
      /data-id="edge:a-&gt;b"( transform="[^"]*")?><text[^>]*x="([\d.]+)" y="([\d.]+)"/.exec(
        r.svg
      )!;
    expect(label[1]).toBeUndefined();
    expect(Number(label[2])).toBeCloseTo(route.label!.x);
  });

  it('grows the viewBox to hold a label that reaches past the layout', async () => {
    // An engine whose drawing ends just under the edge: the label hangs below it.
    const cropped: LayoutEngine = (graph, ctx) => {
      const m = compass(graph, ctx);
      const line = m.edges.get('edge:a->b')!.points[0]!.y;
      return { ...m, height: line + 1 };
    };
    const r = await render(`${PAIR}  a:R -[label]- L:b\n`, { ...grid, engine: cropped });
    const line = r.layout.edges.get('edge:a->b')!.points[0]!.y;
    const [, y, , h] = numbers(/viewBox="([^"]+)"/.exec(r.svg)![1]!);
    // The label's 20 px line, its top 14 − 10 px under the line.
    expect(y! + h!).toBe(Math.ceil(line + 4 + 20));
  });

  it('decodes the entity placeholders the parser left in labels (#599)', async () => {
    const r = await render(
      `${PAIR.replace('[A]', '[A #amp; #lt;B#gt;]')}  a:R -[x #35; y]- L:b\n`,
      grid
    );
    expect(r.svg).toContain('>A &amp; &lt;B&gt;<');
    expect(r.svg).toContain('>x # y<');
    expect(r.svg).not.toContain('&amp;amp;');
    const icon = await render('architecture-beta\n  service a "x #amp; y"[A]\n', grid);
    expect(icon.svg).toMatch(/class="node-icon-text"[^>]*>x &amp; y</);
  });

  it('shrinks both heads of a <--> run too short for the two, and warns once (GAPS T3)', async () => {
    const big = { ...grid, config: { architecture: { iconSize: 300 } } };
    const r = await render(`${PAIR}  a:R <--> L:b\n  a:B <--> T:b\n`, big);
    expect(codes(r)).toEqual([ARCHITECTURE_ARROW_SHRUNK]);
    const heads = [...r.svg.matchAll(/class="arrow"[^>]*points="([^"]+)"/g)].map((m) =>
      numbers(m[1]!)
    );
    const route = attrs(r.svg, /<path class="edge"([^>]*)\/>/).d!;
    const [s, e] = route
      .slice(1)
      .split('L')
      .map((p) => numbers(p));
    const run = Math.abs(e![0]! - s![0]!);
    expect(run).toBeLessThan(100);
    // Both bases meet in the middle: each head is half the run plus its 2 px tip.
    expect(heads[0]![2]! - heads[0]![0]!).toBeCloseTo(run / 2 + 2, 1);
    // Never at the default sizes.
    expect(codes(await render(`${PAIR}  a:R <--> L:b\n`, grid))).toEqual([]);
  });
});

describe('label markup (D710, spec #1333 T4)', () => {
  /** The `<text>` element whose text holds `word`. */
  const textWith = (svg: string, word: string): string =>
    [...svg.matchAll(/<text[^>]*>[^]*?<\/text>/g)].map((m) => m[0]).find((t) => t.includes(word)) ??
    '';
  const SOURCE = `architecture-beta
  group g(cloud)["\`**Cloud** *group*\`"]
  service a(server)["\`**bold** *italic*\`"] in g
  service b(server)[Line one<br>Line two] in g
  service c(database)[<b>Bold</b> <i>it</i>]
  service d(disk)[**literal** *stars*]
  service t "\`**T**\`"[Text icon]
  a:R -["\`**edge** label\`"]- L:b
  b:B -[x<br>y]- T:c
`;

  it('lays a markdown string out as markdown, without its wrapper, in every kind of label', async () => {
    const { svg } = await render(SOURCE, grid);
    // A group title, a service label, an edge label and a text icon.
    for (const word of ['Cloud', 'bold', 'edge', 'node-icon-text']) {
      const text = textWith(svg, word);
      expect(text, word).toMatch(/font-weight="bold">(Cloud|bold|edge|T)</);
      expect(text, word).not.toMatch(/`|\*\*|monospace/);
    }
    expect(textWith(svg, 'italic')).toMatch(/font-style="italic">italic</);
  });

  it('draws <br> and the tags in a plain label, and keeps markdown syntax literal', async () => {
    const { svg, warnings } = await render(SOURCE, grid);
    expect(textWith(svg, 'Line one')).toMatch(/>Line one<\/tspan><tspan[^>]*>Line two</);
    expect(textWith(svg, '>x<')).toMatch(/>x<\/tspan><tspan[^>]*>y</);
    expect(textWith(svg, 'Bold')).toMatch(/font-weight="bold">Bold</);
    expect(textWith(svg, 'Bold')).toMatch(/font-style="italic">it</);
    expect(textWith(svg, 'literal')).toMatch(/>\*\*literal\*\*<\/tspan><tspan[^>]*>\*stars\*</);
    expect(textWith(svg, 'literal')).not.toContain('font-weight');
    expect(codes({ warnings })).toEqual([]);
  });
});

describe('theme table (D331, D541)', () => {
  it('colours edges, heads and borders from the five arch* variables', async () => {
    const r = await render(
      'architecture-beta\n  group g[G]\n  service a(server)[A] in g\n  service b[B] in g\n  a:R --> L:b\n',
      { ...grid, config: { theme: 'default' } }
    );
    const edge = attrs(r.svg, /<path class="edge"([^>]*)\/>/);
    expect(edge.stroke).toBe('var(--_aec)');
    expect(edge['stroke-width']).toBe('var(--_aew)');
    expect(attrs(r.svg, /<polygon class="arrow"([^>]*)\/>/).fill).toBe('var(--_aea)');
    const border = attrs(r.svg, /<rect class="node-bkg"([^>]*)\/>/);
    expect(border.stroke).toBe('var(--_agc)');
    expect(border['stroke-width']).toBe('var(--_agw)');
    expect(r.svg).toContain('--_aec:var(--mermaid-archEdgeColor,var(--_dl))');
    expect(r.svg).toContain('--_aew:var(--mermaid-archEdgeWidth,3px)');
    expect(r.svg).toContain('--_agw:var(--mermaid-archGroupBorderWidth,2px)');
    // v12's constructor-time border (`#c7c7f1` in default), not today's primaryBorderColor.
    expect(r.svg).toContain(
      '--_agc:var(--mermaid-archGroupBorderColor,var(--mermaid-primaryBorderColor,#c7c7f1))'
    );
  });

  it('takes an author’s flat arch* variables', async () => {
    const r = await render(`${PAIR}  a:R --> L:b\n`, {
      ...grid,
      config: { themeVariables: { archEdgeColor: '#ff0000', archEdgeWidth: '5px' } },
    });
    expect(r.svg).toContain('--mermaid-archEdgeColor,#ff0000');
    expect(r.svg).toContain('--mermaid-archEdgeWidth,5px');
  });
});

/**
 * v12's `svgDraw.spec.ts` ("should add ids", fa796a943), its one test carried over: v12 wrote
 * `svg-group-api`, `svg-service-<id>` and `svg-L_<a>_<b>_0` element ids, which v13 does not write
 * (DESIGN §7, MIGRATION "Architecture SVG structure"); the same elements carry their AST ids as
 * `data-id` (D508).
 */
describe('architecture diagram SVGs (v12 svgDraw.spec.ts)', () => {
  it('should add data-ids where v12 added ids', async () => {
    const { svg } = await render(
      `
      architecture-beta
        group api(cloud)[API]

        service db(database)[Database] in api
        service disk1(disk)[Storage] in api
        service disk2(disk)[Storage] in api
        service server(server)[Server] in api

        db:L -- R:server
        disk1:T -- B:server
        disk2:T -- B:db
    `,
      grid
    );
    const ids = (re: RegExp) => [...svg.matchAll(re)].map((m) => m[1]!.replace('&gt;', '>')).sort();
    expect(ids(/<g class="architecture-group" data-id="([^"]+)"/g)).toStrictEqual(['group:api']);
    expect(ids(/<g class="architecture-service" data-id="([^"]+)"/g)).toStrictEqual([
      'service:db',
      'service:disk1',
      'service:disk2',
      'service:server',
    ]);
    expect(ids(/<path class="edge" data-id="([^"]+)"/g)).toStrictEqual([
      'edge:db->server',
      'edge:disk1->server',
      'edge:disk2->db',
    ]);
    expect(svg).not.toMatch(/\sid="/);
  });
});
