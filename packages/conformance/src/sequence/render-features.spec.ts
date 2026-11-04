import { beforeAll, describe, expect, it } from 'vitest';
import type { Mermaid } from 'mermaid';
import { asTest, sequenceApi } from './render-api.ts';

/**
 * What the sequence renderer draws (spec #125 T4), through the public `render()`: participant
 * symbols, arrowheads as inline paths, v12 class names, and v12's theme-name and `look`
 * branches as theme variables (D152): the palette, the shadow and `actorRadius`.
 */
let api: Mermaid;
beforeAll(async () => {
  api = await sequenceApi();
});

const render = async (body: string, config = ''): Promise<string> => {
  const head = config ? `---\nconfig:\n${config}\n---\n` : '';
  return (await api.render('s', asTest(`${head}sequenceDiagram\n${body}`))).svg;
};
const count = (svg: string, re: RegExp): number => svg.match(new RegExp(re, 'g'))?.length ?? 0;
/** The opening tag of the first element whose attributes match `re`. */
const tag = (svg: string, re: RegExp): string =>
  new RegExp(`<[a-z]+[^>]*${re.source}[^>]*>`).exec(svg)?.[0] ?? '';

describe('participants', () => {
  it('draws each kind as its own symbol, at the top and mirrored at the bottom', async () => {
    const kinds = [
      'participant',
      'actor',
      'boundary',
      'control',
      'entity',
      'database',
      'collections',
      'queue',
    ];
    const body = kinds.map((k, i) => `participant P${i}@{ "type": "${k}" }`).join('\n');
    const svg = await render(`${body}\nP0->>P1: x`);
    for (const k of kinds) expect(svg, k).toContain(`class="participant participant-${k}"`);
    expect(count(svg, /class="(actor-man )?actor-top"/)).toBe(kinds.length);
    expect(count(svg, /class="(actor-man )?actor-bottom"/)).toBe(kinds.length);
    expect(count(svg, /class="actor-man actor-top"/)).toBe(4);
    expect(count(svg, /class="actor-line"/)).toBe(kinds.length);
  });

  it('draws no bottom row without mirrorActors', async () => {
    const svg = await render('A->>B: x', '  sequence:\n    mirrorActors: false');
    expect(svg).not.toContain('actor-bottom');
  });

  it('takes the participant corner from actorRadius: v12 neo 6 in redux, classic 3', async () => {
    const rx = (svg: string): string | undefined =>
      /<rect class="actor"[^>]* rx="([\d.]+)"/.exec(svg)?.[1];
    expect(rx(await render('A->>B: x'))).toBe('6');
    expect(rx(await render('A->>B: x', '  theme: default'))).toBe('3');
    expect(rx(await render('A->>B: x', '  themeVariables:\n    actorRadius: 10'))).toBe('10');
  });
});

describe('messages', () => {
  const heads = async (arrow: string): Promise<number> =>
    count(await render(`A${arrow}B: x`), /class="arrowhead"/);

  it('draws arrowheads as inline paths, one per v12 marker', async () => {
    expect(await heads('->>')).toBe(1);
    expect(await heads('-->>')).toBe(1);
    expect(await heads('->')).toBe(0);
    expect(await heads('-)')).toBe(1);
    expect(await heads('-x')).toBe(2); // the cross is two strokes
    expect(await heads('<<->>')).toBe(2);
    expect(await heads('-|\\')).toBe(1);
    expect(await heads('/|-')).toBe(1);
  });

  it('dashes dotted messages and classes lines as v12 did', async () => {
    const svg = await render('A->>B: solid\nB-->>A: dotted');
    expect(tag(svg, /class="messageLine0"/)).not.toContain('stroke-dasharray');
    expect(tag(svg, /class="messageLine1"/)).toContain('stroke-dasharray="3, 3"');
    expect(count(svg, /class="messageText"/)).toBe(2);
  });

  it('draws self messages as a loop and central connections as circles', async () => {
    const svg = await render('A->>A: self\nA->>()B: c');
    expect(tag(svg, /class="messageLine0"/)).toMatch(/^<path/);
    expect(count(svg, /class="centralConnection"/)).toBe(1);
  });

  it('draws sequence numbers as a badge', async () => {
    const svg = await render('autonumber 7\nA->>B: x\nB->>A: y');
    expect(count(svg, /class="sequenceNumberCircle"/)).toBe(2);
    expect(svg).toMatch(/class="sequenceNumber"[^>]*>7</);
    expect(svg).toMatch(/class="sequenceNumber"[^>]*>8</);
  });
});

describe('notes, frames, activations, rects and boxes', () => {
  it('uses v12 class names', async () => {
    const svg = await render(
      'box Aqua Team\nparticipant A\nend\nrect rgb(200, 220, 255)\nalt ok\nA->>+B: x\nelse no\nB-->>-A: y\nend\nend\nNote over A,B: n'
    );
    for (const c of [
      'note',
      'noteText',
      'loopLine',
      'labelBox',
      'labelText',
      'loopText',
      'sectionTitle',
      'activation0',
      'rect',
      'box',
    ])
      expect(svg, c).toContain(`class="${c}"`);
    expect(svg).toContain('fill="rgb(200, 220, 255)"');
  });

  it('warns about a rect colour it refuses and keeps the theme fill', async () => {
    const result = await api.render('s', asTest('sequenceDiagram\nrect url(x)\nA->>B: x\nend'));
    expect(result.warnings.map((w) => w.code)).toContain('STYLE_VALUE_DROPPED');
    expect(result.svg).not.toContain('url(x)');
  });
});

describe('theme variables (D152)', () => {
  it('colours participants from the palette in redux-color only, by declaration order', async () => {
    const svg = await render('A->>B: x');
    expect(svg).toContain('data-color-id="color-0"');
    expect(svg).toContain('data-color-id="color-1"');
    const plain = await render('A->>B: x', '  theme: redux');
    expect(plain).not.toContain('data-color-id');
  });

  it('keeps an activation opaque when the palette colours borders only', async () => {
    const svg = await render('A->>+B: x\nB-->>-A: y', '  theme: redux-dark-color');
    expect(tag(svg, /class="activation0"/)).toContain('fill="var(--_mb)"');
  });

  it('writes the drop shadow in the redux themes and none in the classic ones', async () => {
    expect(await render('A->>B: x')).toContain('filter="var(--_ds)"');
    expect(await render('A->>B: x', '  theme: default')).not.toContain('filter=');
  });

  it('reads the v12 sequence colour variables, which themeVariables override', async () => {
    const svg = await render(
      'A->>B: x',
      "  themeVariables:\n    actorBkg: '#ff0000'\n    signalColor: '#00ff00'"
    );
    expect(svg).toContain('--_ab:var(--mermaid-actorBkg,#ff0000)');
    expect(svg).toContain('--_sc:var(--mermaid-signalColor,#00ff00)');
  });
});

describe('fonts', () => {
  it('honours a set per-key font size and leaves the Mermaid font otherwise', async () => {
    const plain = await render('A->>B: x');
    expect(tag(plain, /class="messages"/)).not.toContain('font-size');
    const sized = await render('A->>B: x', '  sequence:\n    messageFontSize: 20');
    expect(tag(sized, /class="messages"/)).toContain('font-size="20"');
  });
});

describe('review fixes (#143)', () => {
  it('paints nested activations in start order, so the inner bar is on top', async () => {
    const svg = await render('activate A\nactivate A\nA->>B: x\ndeactivate A\ndeactivate A');
    const order = [...svg.matchAll(/class="activation(\d)"/g)].map((m) => m[1]);
    expect(order).toEqual(['0', '1']);
  });

  it('moves numbered lines with central connections clear of the badge, as v12', async () => {
    const svg = await render(
      'participant A\nparticipant B\nautonumber\nB()<<->>A: y\nA/|-()B: r2\nB()/|-A: r3',
      // v12 classic numbers; neo moves a bidirectional start 3 more (messageEndGap).
      '  theme: default'
    );
    const lines = [...svg.matchAll(/<line class="messageLine0"[^>]*>/g)].map((m) => m[0]);
    const attr = (l: string, a: string): number =>
      Number(new RegExp(` ${a}="([^"]*)"`).exec(l)![1]);
    expect(attr(lines[0]!, 'x1')).toBe(250.5);
    expect(attr(lines[1]!, 'x2')).toBe(273);
    expect([attr(lines[2]!, 'x1'), attr(lines[2]!, 'x2')]).toEqual([267.5, 85]);
  });

  it('gives a + or () activation its message id, and no data-ast', async () => {
    const svg = await render('A->>+B: x\nB-->>-A: y');
    const bar = tag(svg, /class="activation0"/);
    expect(bar).toContain('data-id="m:A&gt;B"');
    expect(bar).not.toContain('data-ast');
  });

  it('warns about a refused font family and measures in the font it draws', async () => {
    const bad = await api.render(
      's',
      asTest(
        '%%{init:{"sequence":{"actorFontFamily":"x;color:red","actorFontSize":20}}}%%\nsequenceDiagram\nA->>B: x'
      )
    );
    const good = await render('A->>B: x', '  sequence:\n    actorFontSize: 20');
    expect(bad.warnings.map((w) => w.code)).toContain('STYLE_VALUE_DROPPED');
    expect(bad.svg).toBe(good);
  });

  it('gives participant labels a data-id', async () => {
    const svg = await render('A->>B: x');
    expect(svg).toMatch(/<text class="actor actor-box" data-id="A"/);
  });

  it('draws sequence numbers in the inherited font', async () => {
    const svg = await render('autonumber\nA->>B: x');
    expect(tag(svg, /class="sequenceNumber"/)).not.toContain('font-family');
  });

  it('draws no title for a fragment label that is empty once read', async () => {
    const svg = await render('loop </style>\nA->>B: x\nend');
    expect(svg).not.toContain('class="loopText"');
  });
});

describe('v12 neo geometry as theme variables (#194, D152)', () => {
  const KINDS =
    'participant P\nactor A\nparticipant D@{ "type": "database" }\nparticipant C@{ "type": "collections" }\nP->>C: x';
  const lifelines = (svg: string): Record<string, number> =>
    Object.fromEntries(
      [...svg.matchAll(/class="actor-line" data-id="(\w+)"[^>]* y1="([\d.]+)"/g)].map((m) => [
        m[1]!,
        Number(m[2]),
      ])
    );
  /** The markup of one participant's group. */
  const group = (svg: string, kind: string): string => {
    const at = svg.indexOf(`class="participant participant-${kind}"`);
    const end = svg.indexOf('class="participant participant-', at + 1);
    return svg.slice(at, end < 0 ? undefined : end);
  };
  const attr = (markup: string, re: RegExp): number => Number(re.exec(markup)?.[1]);

  it('starts every lifeline at the bottom of the row in redux, per kind in classic', async () => {
    const neo = lifelines(await render(KINDS));
    expect(new Set(Object.values(neo)).size).toBe(1);
    // v12 classic: the box height 65, the stick figure 80, the database 65 + 2 × 5.
    const classic = lifelines(await render(KINDS, '  theme: default'));
    expect(classic).toEqual({ P: 65, A: 80, D: 75, C: 65 });
  });

  it('scales the stick figure to the 44 px glyph band in redux (v12 15 × 44 / 65)', async () => {
    const r = (svg: string): number => attr(group(svg, 'actor'), /<circle[^>]* r="([\d.]+)"/);
    expect(r(await render(KINDS))).toBeCloseTo((15 * 44) / 65, 1);
    expect(r(await render(KINDS, '  theme: default'))).toBe(15);
  });

  it('draws a database cylinder as tall as the band in redux', async () => {
    // The y of every point of the cylinder's path (M/L: x y; A: … x y).
    const ys = (svg: string): number[] => {
      const d = /<path[^>]* d="([^"]+)"/.exec(group(svg, 'database'))?.[1] ?? '';
      return (d.match(/[MLA][^MLAZ]*/g) ?? []).map((seg) => {
        const n = seg.slice(1).trim().split(/[ ,]+/).map(Number);
        return n[n.length - 1]!;
      });
    };
    const span = (v: number[]): number => Math.max(...v) - Math.min(...v);
    // A 150 px column: the cylinder is 50 wide, its ends' ry 25 / (2.5 + 50 / 50). The path's
    // points span the height less both ends: v12 neo 44 (the band), classic 50 (width / 3).
    const ry = 25 / 3.5;
    const neo = await render(KINDS);
    expect(span(ys(neo))).toBeCloseTo(44 - 2 * ry, 1);
    // Its bottom sits on the band, above the label, so below the lifeline start nothing.
    expect(Math.max(...ys(neo))).toBeLessThan(lifelines(neo).D!);
    expect(span(ys(await render(KINDS, '  theme: default')))).toBeCloseTo(50 - 2 * ry, 1);
  });

  it('draws a collections stack 6 px shorter in redux, so it stops at the lifeline', async () => {
    const heights = (svg: string, kind: string): number[] =>
      [...group(svg, kind).matchAll(/<rect[^>]* height="([\d.]+)"/g)].map((m) => Number(m[1]));
    const neo = await render(KINDS);
    const [box] = heights(neo, 'participant');
    // Top and bottom row, front and back rect each.
    expect(heights(neo, 'collections')).toEqual(Array(4).fill(box! - 6));
    const classic = await render(KINDS, '  theme: default');
    const [classicBox] = heights(classic, 'participant');
    expect(heights(classic, 'collections')).toEqual(Array(4).fill(classicBox));
  });

  it('draws fragment label tabs 15 px taller in redux', async () => {
    const tab = (svg: string): number => {
      const pts = (/class="labelBox" points="([^"]+)"/.exec(svg)?.[1] ?? '').split(/[ ,]/);
      const ys = pts.filter((_, i) => i % 2 === 1).map(Number);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(tab(await render('loop every minute\nA->>B: x\nend'))).toBe(35);
    expect(tab(await render('loop every minute\nA->>B: x\nend', '  theme: default'))).toBe(20);
  });

  it('stops messages 3 px further short in redux, from messageEndGap', async () => {
    const x2 = (svg: string): number => attr(tag(svg, /class="messageLine0"/), / x2="([\d.]+)"/);
    const neo = x2(await render('A->>B: x'));
    expect(x2(await render('A->>B: x', '  themeVariables:\n    messageEndGap: 0'))).toBe(neo + 3);
  });

  it('draws classic geometry in redux when the variables say so', async () => {
    const off =
      '  themeVariables:\n    actorGlyphBand: 0\n    messageEndGap: 0\n    labelBoxExtraHeight: 0\n    actorFooterPadding: 0';
    const lines = lifelines(await render(KINDS, off));
    expect(lines.A).toBe(80);
  });
});
