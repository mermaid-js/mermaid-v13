// Label icons in every type that lays out labels through core/text (I3 #324, D291, D292, D299).
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, type Mermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { icons } from './index.ts';

/** A 24 × 24 pack: `bell` filled with currentColor, `ring` stroked with it, `wide` 2:1. */
const PACK = {
  prefix: 'fa',
  width: 24,
  height: 24,
  icons: {
    bell: { body: '<path fill="currentColor" d="M0 0H24V24z"/>' },
    ring: {
      body: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>',
    },
    wide: { body: '<path fill="currentColor" d="M0 0H48V24z"/>', width: 48 },
  },
};
const BELL = 'd="M0 0H24V24z"';

/** With the extension and `fa` behind a loader, so only packs `labels()` names are loaded. */
async function api(): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([icons]);
  m.registerIconPacks([{ name: 'fa', loader: () => Promise.resolve(PACK) }]);
  return m;
}

const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);
const count = (s: string, part: string) => s.split(part).length - 1;

/** Each label a type lays out, with an icon in it, and how many times the type draws it. */
const SLOTS: readonly (readonly [string, string, number?])[] = [
  ['flowchart LR', 'A["fa:fa-bell node"]'],
  ['flowchart LR', 'A -- "fa:fa-bell edge" --> B'],
  ['flowchart LR', 'subgraph S["fa:fa-bell subgraph"]\n    C\n  end'],
  ['flowchart LR', 'D["`fa:fa-bell **markdown**`"]'],
  ['classDiagram', 'class A["fa:fa-bell title"]'],
  [
    'classDiagram',
    'class B {\n    <<fa:fa-bell>>\n    +fa:fa-bell attribute\n    +fa:fa-bell method()\n  }',
  ],
  ['classDiagram', 'class C\n  note for C "fa:fa-bell note"'],
  ['classDiagram', 'C "fa:fa-bell" --> "fa:fa-bell" D'],
  ['stateDiagram-v2', 's1 : fa:fa-bell description'],
  ['stateDiagram-v2', 's1 --> s2 : fa:fa-bell transition'],
  ['stateDiagram-v2', 's1\n  note right of s1\n    fa:fa-bell note\n  end note'],
  ['stateDiagram-v2', 'state "fa:fa-bell composite" as C {\n    s4\n  }'],
  ['erDiagram', 'A["fa:fa-bell alias"] {\n    string x\n  }'],
  ['erDiagram', 'A ||--o{ B : "fa:fa-bell relationship"'],
  ['erDiagram', 'C {\n    string name PK "fa:fa-bell comment"\n  }'],
  ['sequenceDiagram', 'A->>B: fa:fa-bell message'],
  ['sequenceDiagram', 'Note over A: fa:fa-bell note'],
  // A participant is drawn at the top and the bottom.
  ['sequenceDiagram', 'participant P as fa:fa-bell participant', 2],
  ['sequenceDiagram', 'loop fa:fa-bell loop\n    A->>B: x\n  end'],
  [
    'sequenceDiagram',
    'alt fa:fa-bell alt\n    A->>B: y\n  else fa:fa-bell else\n    A->>B: z\n  end',
  ],
  ['sequenceDiagram', 'box fa:fa-bell box\n    participant Q\n  end'],
  ['sequenceDiagram', 'title fa:fa-bell title'],
];

describe('every label slot of every type', () => {
  const slots = SLOTS.map(([header, body, times = 1]) => ({ header, body, times }));

  it.each(slots)('$header: $body', async ({ header, body, times }) => {
    const r = await (await api()).render('i', `${header}\n  ${body}`);
    expect(codes(r)).toEqual([]);
    expect(count(r.svg, BELL)).toBe(count(body, 'fa:fa-bell') * times);
    expect(r.svg).not.toContain('fa:fa-');
  });

  it.each(slots)('without the extension, $header: $body warns once', async ({ header, body }) => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const r = await m.render('i', `${header}\n  ${body}`);
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
    expect(r.svg).toContain('fa:fa-bell');
  });
});

describe('text output (D299)', () => {
  it.each([
    ['flowchart LR\n  A["fa:fa-bell a"] -- "fa:fa-bell e" --> B'],
    ['erDiagram\n  A ||--o{ B : "fa:fa-bell r"'],
    ['sequenceDiagram\n  A->>B: fa:fa-bell m\n  Note over A: fa:fa-bell n'],
  ])('shows icons as written with one ASCII_DROPPED: %s', async (source) => {
    const r = await (await api()).render('i', source, { format: 'ascii' });
    expect(r.text).toContain('fa:fa-bell');
    expect(r.warnings).toEqual([
      expect.objectContaining({ code: 'ASCII_DROPPED', feature: 'icon' }),
    ]);
  });
});

/** The label `fa:fa-<icon> x` as drawn: the box's corner and scale, and where " x" starts. */
function placed(svg: string) {
  const m =
    /<tspan x="([\d.-]+)" y="([\d.-]+)"[^>]*>\s*x<\/tspan><\/text><g[^>]*transform="translate\(([\d.-]+),([\d.-]+)\)"><g transform="scale\(([\d.]+)\)"/.exec(
      svg
    );
  if (!m) throw new Error(`no boxed label in ${svg}`);
  const [textX, baseline, x, y, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { size: 24 * s, width: textX - x, belowBaseline: y + 24 * s - baseline };
}

describe('placement as v12 .label-icon', () => {
  it.each([
    ['flowchart LR\n  A["%"]'],
    ['flowchart LR\n  A -- "%" --> B'],
    ['classDiagram\n  class A["%"]'],
    ['stateDiagram-v2\n  s1 : %'],
    ['erDiagram\n  A ||--o{ B : "%"'],
    ['sequenceDiagram\n  A->>B: %'],
    ['sequenceDiagram\n  Note over A: %'],
  ])('1em tall, 1em × aspect wide, 0.125em below the baseline: %s', async (source) => {
    const m = await api();
    for (const [icon, aspect] of [
      ['bell', 1],
      ['wide', 2],
    ] as const) {
      const r = await m.render('i', source.replace('%', `fa:fa-${icon} x`));
      const { size, width, belowBaseline } = placed(r.svg);
      expect(width, icon).toBeCloseTo(size * aspect, 1);
      expect(belowBaseline, icon).toBeCloseTo(0.125 * size, 1);
    }
  });
});

describe('currentColor strokes take the label colour', () => {
  it('a stroked icon in a node label gets the colour the label text is filled with', async () => {
    const m = await api();
    const r = await m.render('i', 'flowchart LR\n  A["fa:fa-ring x"]\n  style A color:#f00');
    expect(r.svg).toMatch(
      /<g transform="scale\([\d.]+\)" color="#f00"><circle[^>]*stroke="currentColor"/
    );
  });

  it('inherits the colour from the group the label sits in', async () => {
    const m = await api();
    const r = await m.render('i', 'flowchart LR\n  A["fa:fa-ring x"]');
    // Flowchart fills its node texts from `<g class="nodes" fill="var(--_nt)">`.
    expect(r.svg).toMatch(/<g transform="scale\([\d.]+\)" color="var\(--_nt\)"><circle/);
  });

  it.each([
    ['flowchart LR\n  A -- "%" --> B\n  subgraph S["%"]\n    A\n  end', 2],
    ['classDiagram\n  class A["%"] {\n    +% x\n  }\n  note for A "%"', 3],
    ['stateDiagram-v2\n  s1 : %\n  s1 --> s2 : %', 2],
    ['erDiagram\n  A ||--o{ B : "%"\n  A {\n    string x PK "%"\n  }', 2],
    ['sequenceDiagram\n  A->>B: %\n  Note over A: %', 2],
  ])('in every label of %s, in neo-dark too', async (source, n) => {
    const m = await api();
    for (const theme of ['default', 'neo-dark']) {
      const text = `---\nconfig:\n  theme: ${theme}\n---\n${source.replaceAll('%', 'fa:fa-ring')}`;
      const r = await m.render('i', text);
      const colours = [
        ...r.svg.matchAll(/<g transform="scale\([\d.]+\)" color="([^"]+)"><circle/g),
      ];
      expect(colours, theme).toHaveLength(n);
      for (const [, c] of colours) expect(c).toMatch(/^(var\(--[\w-]+\)|#[\da-f]+)$/i);
      expect(r.svg).not.toContain('mermaid-label-icon');
      assertInert(r.svg, { themeStyle: r.svg.includes('<style>') });
    }
  });

  it('leaves a user class of the marker’s name alone', async () => {
    const r = await (
      await api()
    ).render(
      'i',
      'flowchart LR\n  A["fa:fa-ring x"]:::mermaid-label-icon\n  classDef mermaid-label-icon stroke:#f00'
    );
    expect(r.svg).toContain('class="node default mermaid-label-icon"');
    expect(r.svg).toMatch(/<g transform="scale\([\d.]+\)" color="var\(--_nt\)"><circle/);
  });

  it('leaves an icon that paints only inherited fills alone', async () => {
    const r = await (await api()).render('i', 'flowchart LR\n  A["fa:fa-bell x"]');
    expect(r.svg).toMatch(/<g transform="scale\([\d.]+\)"><path d="M0 0H24V24z"\/>/);
  });
});
