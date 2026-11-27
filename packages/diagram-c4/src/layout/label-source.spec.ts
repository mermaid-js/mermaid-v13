import { beforeAll, describe, expect, it } from 'vitest';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutC4Beta } from '../beta/layout.ts';
import { parseC4Beta } from '../beta/parser.ts';
import { renderC4BetaForTest, renderC4ForTest } from '../render/harness.ts';
import { c4TestConfig, c4TestContext, c4TestTheme, parsedC4 } from '../test-context.ts';
import { layoutC4 } from './layout.ts';
import type { C4Layout, PlacedLabel } from './types.ts';

/**
 * Markdown strings and plain text in every C4 label kind (spec #1368, #1400), through the
 * layout's seam on parsed sources. In the default mode markdown is read only in a quoted
 * markdown string, which the parser marks as it strips the quotes; bare backticks, `**x**` and a
 * code span in plain text are drawn as written. With `markdownAlwaysOn` every label is markdown,
 * while the fixed words of a line (`[Container: `, a step number) stay as written. Tags draw and
 * a written `\n` breaks in every kind, in both modes.
 */
let theme: Theme;
beforeAll(async () => {
  theme = await c4TestTheme('default');
});

type Runs = [string, number][][];
const runs = (label: MeasuredLabel | undefined): Runs =>
  (label?.lines ?? []).map((line) => line.map((r): [string, number] => [r.text, r.style]));
const text = (label: PlacedLabel | undefined): string[] =>
  (label?.text.lines ?? []).map((line) => line.map((r) => r.text).join(''));

/** Every drawn text of a layout, by a name of its kind. */
function texts(layout: C4Layout): Map<string, PlacedLabel> {
  const out = new Map<string, PlacedLabel>();
  const put = (name: string, label: PlacedLabel | undefined) => label && out.set(name, label);
  put('title', layout.title);
  for (const e of layout.elements) {
    put(`${e.alias}.name`, e.name);
    put(`${e.alias}.type`, e.type);
    put(`${e.alias}.descr`, e.descr);
  }
  for (const b of layout.boundaries) {
    put(`${b.alias}.label`, b.label);
    put(`${b.alias}.type`, b.type);
    put(`${b.alias}.descr`, b.descr);
  }
  for (const r of layout.relations) {
    put(`${r.from}-${r.to}.label`, r.label);
    put(`${r.from}-${r.to}.techn`, r.techn);
  }
  return out;
}

/** The integrator config of a mode: the default, `markdownAlwaysOn` globally, or in a section. */
type Mode = boolean | 'section';
const modeConfig = (mode: Mode, section: string): Record<string, unknown> => {
  if (mode === 'section') return { [section]: { markdownAlwaysOn: true } };
  return mode ? { markdownAlwaysOn: true } : {};
};

function layC4(src: string, mode: Mode = false): Map<string, PlacedLabel> {
  const parsed = parsedC4(src, modeConfig(mode, 'c4'));
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return texts(layoutC4(parsed.model, c4TestContext(parsed.config, theme)));
}

function layBeta(src: string, mode: Mode = false): Map<string, PlacedLabel> {
  const { model, diagnostics } = parseC4Beta(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const config = c4TestConfig(undefined, modeConfig(mode, 'c4beta'), true);
  return texts(layoutC4Beta(model, c4TestContext(config, theme)));
}

const B = Style.Bold;
const I = Style.Italic;

/** `kind **bold** _ital_` as markdown over a base style `s`, runs of one style merged. */
const md = (kind: string, s = 0): Runs => {
  const line: [string, number][] = [];
  for (const [t, style] of [
    [`${kind} `, s],
    ['bold', s | B],
    [' ', s],
    ['ital', s | I],
  ] as const) {
    const last = line.at(-1);
    if (last?.[1] === style) last[0] += t;
    else line.push([t, style]);
  }
  return [line];
};
/** `kind **bold** _ital_` as written, in a base style `s`. */
const plain = (kind: string, s = 0): Runs => [[[`${kind} **bold** _ital_`, s]]];

// Each C4 label kind once, written by `w(kind)`: title, element label, description and
// technology, boundary label and type, relation label and technology.
const C4 = (w: (kind: string) => string) => `C4Context
title ${w('title')}
Container(c, ${w('label')}, ${w('techn')}, ${w('descr')})
Boundary(b, ${w('boundary')}, ${w('btype')}) {
  System(s, "S")
}
Rel(c, s, ${w('rel')}, ${w('rtech')})
`;

const BETA = (w: (kind: string) => string) => `c4-beta context
title ${w('title')}
container c ${w('label')} ${w('descr')} ${w('techn')}
deploymentNode n ${w('node')} ${w('ndescr')} ${w('ntech')} instances ${w('inst')} {
  softwareSystem s "S"
}
c --> s : ${w('rel')} ${w('rtech')}
`;

describe.each([false, true])('C4 labels, markdownAlwaysOn %s', (compat) => {
  it('reads a quoted markdown string as markdown in every kind, over the kind’s own style', () => {
    const at = layC4(
      C4((k) => `"\`${k} **bold** _ital_\`"`),
      compat
    );
    expect(runs(at.get('title')?.text)).toEqual(md('title'));
    expect(runs(at.get('c.name')?.text)).toEqual(md('label', B));
    expect(runs(at.get('c.type')?.text)).toEqual([
      [
        ['[Container: techn ', 0],
        ['bold', B],
        [' ', 0],
        ['ital', I],
        [']', 0],
      ],
    ]);
    expect(runs(at.get('c.descr')?.text)).toEqual(md('descr'));
    expect(runs(at.get('b.label')?.text)).toEqual(md('boundary', B));
    expect(text(at.get('b.type'))).toEqual(['[btype bold ital]']);
    expect(runs(at.get('c-s.label')?.text)).toEqual(md('rel'));
    expect(runs(at.get('c-s.techn')?.text)).toEqual([
      [
        ['[rtech ', I],
        ['bold', I | B],
        [' ital]', I],
      ],
    ]);
  });

  it.skipIf(compat)(
    'draws plain `**x**`, bare backticks and a code span as written in every kind',
    () => {
      const quoted = layC4(
        C4((k) => `"${k} **bold** _ital_"`),
        compat
      );
      expect(runs(quoted.get('c.name')?.text)).toEqual(plain('label', B));
      expect(runs(quoted.get('c.descr')?.text)).toEqual(plain('descr'));
      expect(text(quoted.get('c.type'))).toEqual(['[Container: techn **bold** _ital_]']);
      expect(text(quoted.get('b.type'))).toEqual(['[btype **bold** _ital_]']);
      expect(runs(quoted.get('c-s.label')?.text)).toEqual(plain('rel'));
      expect(text(quoted.get('title'))).toEqual(['"title **bold** _ital_"']);
      // Bare backticks: the parser marks only a quoted markdown string.
      const bare = layC4(
        C4((k) => `\`${k} **bold**\``),
        compat
      );
      for (const name of ['c.name', 'c.descr', 'b.label', 'c-s.label', 'c-s.techn', 'title']) {
        expect(text(bare.get(name)).join(''), name).toMatch(/`\w+ \*\*bold\*\*`/);
      }
      const span = layC4(
        C4((k) => `"${k} a \`code\` b"`),
        compat
      );
      expect(text(span.get('c.descr'))).toEqual(['descr a `code` b']);
    }
  );

  it('draws tags and breaks at a written \\n in every kind, markdown string or not', () => {
    const tags = layC4(
      C4((k) => `"${k} <b>b</b><br>two"`),
      compat
    );
    const nl = layC4(
      C4((k) => `"${k} one\\ntwo"`),
      compat
    );
    const mdNl = layC4(
      C4((k) => `"\`${k} **one**\\ntwo\`"`),
      compat
    );
    for (const name of ['c.name', 'c.descr', 'b.label', 'c-s.label']) {
      expect(text(tags.get(name))[1], name).toBe('two');
      expect(text(nl.get(name)), name).toHaveLength(2);
      expect(text(nl.get(name))[1], name).toBe('two');
      expect(text(mdNl.get(name))[1], name).toBe('two');
    }
    // A title keeps its quotes unless it is a markdown string, as v12 drew them.
    expect(text(tags.get('title'))).toEqual(['"title b', 'two"']);
    expect(text(nl.get('title'))).toEqual(['"title one', 'two"']);
    expect(text(mdNl.get('title'))).toEqual(['title one', 'two']);
    expect(runs(tags.get('c.descr')?.text)[0]).toEqual([
      ['descr ', 0],
      ['b', B],
    ]);
    expect(text(nl.get('c.type'))).toEqual(['[Container: techn one', 'two]']);
    expect(text(nl.get('c-s.techn'))).toEqual(['[rtech one', 'two]']);
  });

  it.skipIf(compat)(
    'keeps a plain field plain on a line a markdown string shares (C4Dynamic’s number)',
    () => {
      const at = layC4(
        'C4Dynamic\nPerson(a, "A")\nPerson(b, "B")\nRel(a, b, "`**x** _y_`")\nRel(b, a, "**x**")',
        compat
      );
      expect(runs(at.get('a-b.label')?.text)).toEqual([
        [
          ['1: ', 0],
          ['x', B],
          [' ', 0],
          ['y', I],
        ],
      ]);
      expect(text(at.get('b-a.label'))).toEqual(['2: **x**']);
    }
  );

  it.skipIf(compat)(
    'reads a named argument written as a markdown string as markdown, and the last statement’s mark wins',
    () => {
      const at = layC4(
        'C4Context\nPerson(a, "A", $descr="`**d**`")\nSystem(s, "`**s**`")\nSystem(s, "**s**")',
        compat
      );
      expect(runs(at.get('a.descr')?.text)).toEqual([[['d', B]]]);
      expect(text(at.get('s.name'))).toEqual(['**s**']);
    }
  );
});

describe.each([false, true])('c4-beta labels, markdownAlwaysOn %s', (compat) => {
  it('reads a quoted markdown string as markdown in every kind', () => {
    const at = layBeta(
      BETA((k) => `"\`${k} **bold** _ital_\`"`),
      compat
    );
    expect(runs(at.get('title')?.text)).toEqual(md('title'));
    expect(runs(at.get('c.name')?.text)).toEqual(md('label', B));
    expect(runs(at.get('c.descr')?.text)).toEqual(md('descr'));
    expect(text(at.get('c.type'))).toEqual(['[Container: techn bold ital]']);
    expect(runs(at.get('n.label')?.text)).toEqual(md('node', B));
    expect(runs(at.get('n.descr')?.text)).toEqual(md('ndescr'));
    expect(text(at.get('n.type'))).toEqual(['[ntech bold ital] xinst bold ital']);
    expect(runs(at.get('c-s.label')?.text)).toEqual(md('rel', B));
    expect(runs(at.get('c-s.techn')?.text)[0]?.[1]).toEqual(['bold', I | B]);
  });

  it.skipIf(compat)('draws plain `**x**` as written, and tags', () => {
    const at = layBeta(
      BETA((k) => `"${k} **bold** _ital_"`),
      compat
    );
    expect(runs(at.get('c.name')?.text)).toEqual(plain('label', B));
    expect(text(at.get('c.type'))).toEqual(['[Container: techn **bold** _ital_]']);
    expect(text(at.get('c-s.label'))).toEqual(['rel **bold** _ital_']);
    const tags = layBeta(
      BETA((k) => `"${k} <i>i</i><br>two"`),
      compat
    );
    expect(text(tags.get('c.descr'))).toEqual(['descr i', 'two']);
  });

  it('breaks at a written \\n in every kind, markdown string or not (#1368)', () => {
    const nl = layBeta(
      BETA((k) => `"${k} one\\ntwo"`),
      compat
    );
    for (const name of ['c.name', 'c.descr', 'n.label', 'n.descr', 'c-s.label']) {
      expect(text(nl.get(name)), name).toHaveLength(2);
      expect(text(nl.get(name))[1], name).toBe('two');
    }
    expect(text(nl.get('c.type'))).toEqual(['[Container: techn one', 'two]']);
    expect(text(nl.get('n.type'))).toEqual(['[ntech one', 'two] xinst one', 'two']);
    const mdNl = layBeta(
      BETA((k) => `"\`${k} **one**\\ntwo\`"`),
      compat
    );
    expect(runs(mdNl.get('c.descr')?.text)).toEqual([
      [
        ['descr ', 0],
        ['one', B],
      ],
      [['two', 0]],
    ]);
  });

  it('keeps every other escape standing for its character', () => {
    const at = layBeta('c4-beta context\nperson a "say \\"hi\\" \\t \\\\ x" \'it\\\'s\'', compat);
    expect(text(at.get('a.name'))).toEqual(['say "hi" t \\ x']);
    expect(text(at.get('a.descr'))).toEqual(["it's"]);
  });
});

describe.each([true, 'section'] as const)(
  'markdownAlwaysOn (%s): every label is markdown',
  (mode) => {
    it('reads plain `**x** _y_` as markdown in every C4 kind, over the kind’s own style', () => {
      const at = layC4(
        C4((k) => `"${k} **bold** _ital_"`),
        mode
      );
      expect(runs(at.get('c.name')?.text)).toEqual(md('label', B));
      expect(runs(at.get('c.descr')?.text)).toEqual(md('descr'));
      expect(runs(at.get('b.label')?.text)).toEqual(md('boundary', B));
      expect(runs(at.get('c-s.label')?.text)).toEqual(md('rel'));
      // A line's fixed words stay as written; its field is markdown.
      expect(runs(at.get('c.type')?.text)).toEqual([
        [
          ['[Container: techn ', 0],
          ['bold', B],
          [' ', 0],
          ['ital', I],
          [']', 0],
        ],
      ]);
      expect(text(at.get('b.type'))).toEqual(['[btype bold ital]']);
      expect(runs(at.get('c-s.techn')?.text)).toEqual([
        [
          ['[rtech ', I],
          ['bold', I | B],
          [' ital]', I],
        ],
      ]);
      // The title line keeps its quotes, which markdown draws.
      expect(text(at.get('title'))).toEqual(['"title bold ital"']);
      const bare = layC4(
        C4((k) => `\`${k} code\``),
        mode
      );
      expect(runs(bare.get('c.descr')?.text)).toEqual([[['descr code', Style.Mono]]]);
    });

    it('keeps a step number as written, and reads the label after it', () => {
      const at = layC4('C4Dynamic\nPerson(a, "A")\nPerson(b, "B")\nRel(a, b, "**x** _y_")', mode);
      expect(runs(at.get('a-b.label')?.text)).toEqual([
        [
          ['1: ', 0],
          ['x', B],
          [' ', 0],
          ['y', I],
        ],
      ]);
    });

    it('reads plain `**x** _y_` as markdown in every c4-beta kind', () => {
      const at = layBeta(
        BETA((k) => `"${k} **bold** _ital_"`),
        mode
      );
      expect(runs(at.get('c.name')?.text)).toEqual(md('label', B));
      expect(runs(at.get('c.descr')?.text)).toEqual(md('descr'));
      expect(text(at.get('c.type'))).toEqual(['[Container: techn bold ital]']);
      expect(runs(at.get('n.label')?.text)).toEqual(md('node', B));
      expect(runs(at.get('n.descr')?.text)).toEqual(md('ndescr'));
      expect(text(at.get('n.type'))).toEqual(['[ntech bold ital] xinst bold ital']);
      expect(runs(at.get('c-s.label')?.text)).toEqual(md('rel', B));
      expect(runs(at.get('c-s.techn')?.text)[0]?.[1]).toEqual(['bold', I | B]);
    });
  }
);

describe('the rendered SVG', () => {
  it('draws a markdown string’s emphasis and no backticks, and plain `**x**` as written', async () => {
    const src = 'C4Context\nPerson(a, "**plain** label", "`**md** descr`")\nPerson(b, `**bare**`)';
    const { svg } = await renderC4ForTest(src);
    expect(svg).toMatch(/font-weight="bold"[^>]*>md<\/tspan>/);
    expect(svg).not.toContain('`**md**');
    expect(svg).toContain('**plain** label');
    expect(svg).toContain('`**bare**`');
  });

  it('does the same for c4-beta', async () => {
    const src = 'c4-beta context\nperson a "`**md** name`" "**plain** descr"';
    const { svg } = await renderC4BetaForTest(src);
    expect(svg).not.toContain('`**md**');
    expect(svg).toContain('**plain** descr');
  });
});
