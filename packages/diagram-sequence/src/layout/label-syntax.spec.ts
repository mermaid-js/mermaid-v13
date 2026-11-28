/**
 * How each sequence label kind reads what is written (#1368, #1400): markdown only in a quoted
 * markdown string, tags draw, bare backticks and plain `**x**` are text, and a written `\n`
 * breaks the line. With `markdownAlwaysOn` every label is markdown: plain markers draw too.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { parseSequence } from '../parser/index.ts';
import { sequence as diagramPlugin } from '../plugin.ts';
import { layoutSequence, type SequenceLayout } from './index.ts';

const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;
let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

/** Every label kind, each holding `write(kind)`. */
const source = (write: (kind: string) => string): string => `sequenceDiagram
  title ${write('title')}
  box ${write('box')}
  participant A as ${write('alias')}
  end
  participant ${write('name')}
  participant B
  A->>B: ${write('message')}
  Note over A,B: ${write('note')}
  loop ${write('loop')}
    B-->>A: ok
  end
  alt ${write('alt')}
    B-->>A: ok
  else ${write('else')}
    B-->>A: ok
  end
  opt ${write('opt')}
    B-->>A: ok
  end
  par ${write('par')}
    B-->>A: ok
  and ${write('and')}
    B-->>A: ok
  end
  critical ${write('critical')}
    B-->>A: ok
  option ${write('option')}
    B-->>A: ok
  end
  break ${write('break')}
    B-->>A: ok
  end
`;

const KINDS = [
  'title',
  'box',
  'alias',
  'name',
  'message',
  'note',
  'loop',
  'alt',
  'else',
  'opt',
  'par',
  'and',
  'critical',
  'option',
  'break',
] as const;

/** A label's lines, with bold runs in `<b>` and italic runs in `<i>`. */
const shown = (label: MeasuredLabel): string[] =>
  label.lines.map((line) =>
    line
      .map((r) => {
        let t = r.text;
        if (r.style & Style.Italic) t = `<i>${t}</i>`;
        if (r.style & Style.Bold) t = `<b>${t}</b>`;
        return t;
      })
      .join('')
  );

function lay(src: string, config: Record<string, unknown> = {}, cells = false): SequenceLayout {
  const { model } = parseSequence(src);
  return layoutSequence(model, {
    config: { sequence: {}, ...config } as ResolvedConfig,
    measurer: cells ? cellMeasurer : tableMeasurer,
    units: cells ? cellProfile() : pxProfile,
    theme: createTheme(spec, { diagram: diagramTheme }),
    warn: () => {},
  });
}

/** Each label kind's drawn lines, found by the kind's name; fragment titles keep their brackets. */
function labels(layout: SequenceLayout): Record<string, string[]> {
  const all: MeasuredLabel[] = [
    ...(layout.title ? [layout.title.text] : []),
    ...layout.boxes.flatMap((b) => (b.label ? [b.label.text] : [])),
    ...layout.participants.map((p) => p.label),
    ...layout.messages.flatMap((m) => (m.label ? [m.label.text] : [])),
    ...layout.notes.map((n) => n.label.text),
    ...layout.fragments.flatMap((f) => [
      ...(f.title ? [f.title.text] : []),
      ...f.sections.flatMap((s) => (s.label ? [s.label.text] : [])),
    ]),
  ].filter((l) => l.lines[0]?.[0] !== undefined);
  const word = (l: MeasuredLabel): string =>
    l.lines
      .flat()
      .map((r) => r.text)
      .join('')
      .replace(/^[[`"]+/, '')
      .split(/[\s<]/)[0]!;
  return Object.fromEntries(
    KINDS.map((k) => {
      const l = all.find((x) => word(x) === k);
      return [k, l ? shown(l) : []];
    })
  );
}

/** What each kind draws, by `expected(kind)`, fragments in brackets. */
const each = (expected: (kind: string) => string[]): Record<string, string[]> =>
  Object.fromEntries(
    KINDS.map((k) => {
      const lines = expected(k);
      const fragment = KINDS.indexOf(k) >= KINDS.indexOf('loop');
      if (!fragment) return [k, lines];
      return [
        k,
        lines.map((l, i) => (i === 0 ? '[' : '') + l + (i === lines.length - 1 ? ']' : '')),
      ];
    })
  );

const MODES = [
  ['default mode', {}],
  ['markdownAlwaysOn', { markdownAlwaysOn: true }],
] as const;

describe.each(MODES)('sequence label kinds, %s', (_, config) => {
  it('draw a quoted markdown string as markdown, without its wrapper', () => {
    const layout = lay(
      source((k) => `"\`${k} **bold** _ital_\`"`),
      config
    );
    expect(labels(layout)).toEqual(each((k) => [`${k} <b>bold</b> <i>ital</i>`]));
  });

  it('draw tags', () => {
    // A participant name stops at `<`, as in v12: only an alias holds tags.
    const write = (k: string): string =>
      k === 'name' ? k : `${k} <b>bold</b> <i>ital</i><br>next`;
    const layout = lay(source(write), config);
    expect(labels(layout)).toEqual(
      each((k) => (k === 'name' ? [k] : [`${k} <b>bold</b> <i>ital</i>`, 'next']))
    );
  });

  it('break at a written \\n, in a markdown string too', () => {
    expect(
      labels(
        lay(
          source((k) => `${k} one\\ntwo`),
          config
        )
      )
    ).toEqual(each((k) => [`${k} one`, 'two']));
    expect(
      labels(
        lay(
          source((k) => `"\`${k} **one**\\ntwo\`"`),
          config
        )
      )
    ).toEqual(each((k) => [`${k} <b>one</b>`, 'two']));
  });
});

describe('sequence label kinds, default mode only', () => {
  it('draw bare backticks as written', () => {
    const layout = lay(source((k) => `\`${k} **bold** _ital_\``));
    expect(labels(layout)).toEqual(each((k) => [`\`${k} **bold** _ital_\``]));
  });

  it('draw plain markdown markers and a code span as written', () => {
    expect(labels(lay(source((k) => `${k} **bold** _ital_`)))).toEqual(
      each((k) => [`${k} **bold** _ital_`])
    );
    expect(labels(lay(source((k) => `${k} a \`code\` b`)))).toEqual(
      each((k) => [`${k} a \`code\` b`])
    );
  });
});

describe('sequence label kinds, markdownAlwaysOn', () => {
  const on = { markdownAlwaysOn: true };

  it('draw plain markdown markers as bold and italic in every kind', () => {
    expect(
      labels(
        lay(
          source((k) => `${k} **bold** _ital_`),
          on
        )
      )
    ).toEqual(each((k) => [`${k} <b>bold</b> <i>ital</i>`]));
  });

  it('draw a code span as inline code, without its backticks', () => {
    const layout = lay(
      source((k) => `${k} a \`code\` b`),
      on
    );
    const mono = layout.messages[0]!.label!.text.lines[0]!.find((r) => r.text === 'code');
    expect(mono?.style).toBe(Style.Mono);
    expect(labels(layout)).toEqual(each((k) => [`${k} a code b`]));
  });

  it('keeps the brackets around a block title and the number in cells as text', () => {
    const layout = lay(
      'sequenceDiagram\n  autonumber\n  A->>B: **b** x\n  loop **l**\n    B->>A: - item\n  end',
      on,
      true
    );
    expect(shown(layout.messages[0]!.label!.text)).toEqual(['1. <b>b</b> x']);
    expect(shown(layout.messages[1]!.label!.text)).toEqual(['2. - item']);
    expect(shown(layout.fragments[0]!.title!.text)).toEqual(['[<b>l</b>]']);
  });
});

describe('sequence labels and a written \\n', () => {
  it('breaks a path at each \\n, as at <br>', () => {
    const layout = lay('sequenceDiagram\n  A->>B: C:\\new\\path');
    expect(shown(layout.messages[0]!.label!.text)).toEqual(['C:', 'ew\\path']);
  });

  it('keeps a backslash and an n written as an entity', () => {
    const layout = lay('sequenceDiagram\n  A->>B: C:#92;new');
    expect(shown(layout.messages[0]!.label!.text)).toEqual(['C:\\new']);
  });

  it('does not break inside $$…$$ math', () => {
    const layout = lay('sequenceDiagram\n  A->>B: a $$x \\neq y$$ b');
    expect(layout.messages[0]!.label!.text.lines).toHaveLength(1);
  });

  it('measures each line, so a two-line message is as wide as its longer line', () => {
    const one = lay('sequenceDiagram\n  A->>B: a much longer line');
    const two = lay('sequenceDiagram\n  A->>B: a much longer line\\nx');
    const [a, b] = [one.messages[0]!.label!, two.messages[0]!.label!];
    expect(b.width).toBe(a.width);
    expect(b.height).toBeGreaterThan(a.height);
  });

  it('reads a markdown string before the sequence number is put in front, in cells', () => {
    const layout = lay('sequenceDiagram\n  autonumber\n  A->>B: "`**b** x`"', {}, true);
    expect(shown(layout.messages[0]!.label!.text)).toEqual(['1. <b>b</b> x']);
  });
});
