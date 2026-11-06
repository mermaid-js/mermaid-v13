/**
 * Completion and hover on the diagram text (#32, D93, D95), through the service API. The
 * goldens (goldens/flowchart/completions and hover) print whole lists; these assert the rules.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { flowchartDocs, FlowTokenKind as T } from '@mermaid-js/diagram-flowchart/language';
import { createLanguageService } from './index.ts';
import type { CompletionItem } from './index.ts';

const service = createLanguageService();
beforeAll(() => service.preload());

/** The snapshot of `marked` without its `|` cursor, and the cursor offset. */
function at(marked: string) {
  const offset = marked.indexOf('|');
  const doc = service.update('file:///c.mmd', marked.slice(0, offset) + marked.slice(offset + 1));
  return { doc, offset };
}
const complete = (marked: string): readonly CompletionItem[] => {
  const { doc, offset } = at(marked);
  return doc.completions(offset);
};
const labels = (marked: string) => complete(marked).map((i) => i.label);

const STATEMENT_KEYWORDS = [
  'subgraph',
  'style',
  'classDef',
  'class',
  'linkStyle',
  'click',
  'accTitle',
  'accDescr',
];

describe('completion', () => {
  it('in an empty document or a partial header: the diagram keywords', () => {
    expect(labels('|')).toEqual([
      'flowchart',
      'graph',
      'flowchart-elk',
      'swimlane-beta',
      'classDiagram',
      'erDiagram',
      'pie',
      'sequenceDiagram',
      'timeline',
      'timeline LR',
      'timeline TD',
      'stateDiagram-v2',
      'stateDiagram',
      'journey',
      'quadrantChart',
      'radar-beta',
    ]);
    expect(labels('qua|')).toEqual(['quadrantChart']);
    expect(labels('rad|')).toEqual(['radar-beta']);
    expect(labels('cla|')).toEqual(['classDiagram']);
    expect(labels('jour|')).toEqual(['journey']);
    expect(labels('sta|')).toEqual(['stateDiagram-v2', 'stateDiagram']);
    expect(complete('flo|')).toEqual([
      expect.objectContaining({ label: 'flowchart', range: { start: 0, end: 3 } }),
      expect.objectContaining({ label: 'flowchart-elk', range: { start: 0, end: 3 } }),
    ]);
    expect(labels('sw|')).toEqual(['swimlane-beta']);
    expect(labels('---\ntitle: x\n---\ngr|')).toEqual(['graph']);
    // Only the first line: a later line of an undetected text gets nothing.
    expect(labels('foo\n|')).toEqual([]);
  });

  it('after the header keyword: directions', () => {
    expect(labels('flowchart |')).toEqual(['TB', 'TD', 'BT', 'LR', 'RL']);
    expect(labels('flowchart |\nA')).toEqual(['TB', 'TD', 'BT', 'LR', 'RL']);
    expect(complete('graph T|')).toEqual([
      expect.objectContaining({ label: 'TB', range: { start: 6, end: 7 } }),
      expect.objectContaining({ label: 'TD' }),
    ]);
  });

  it('at a statement start: statement keywords, ids, and `end` only in a subgraph', () => {
    const top = labels('flowchart TD\n  A --> B\n  |');
    expect(top).toEqual(expect.arrayContaining([...STATEMENT_KEYWORDS, 'A', 'B']));
    expect(top).not.toContain('end');
    expect(top).not.toContain('flowchart');
    expect(labels('flowchart TD\n  subgraph S\n    A\n    |\n  end')).toContain('end');
    expect(labels('flowchart TD\n  subgraph S\n    A\n\n|\n  end')).toContain('end');
  });

  it('filters by the typed prefix and leaves out the id being typed', () => {
    expect(labels('flowchart TD\n  clever --> B\n  cl|')).toEqual([
      'classDef',
      'class',
      'click',
      'clever',
    ]);
    expect(labels('flowchart TD\n  A --> B\n  newId|')).not.toContain('newId');
  });

  it('offers what the cursor follows: ids after a link or `&`, classes after `:::` and `class`', () => {
    const doc = 'flowchart TD\n  classDef hot fill:#f00\n  A:::cold --> B\n';
    expect(labels(`${doc}  A --> |`)).toEqual(['A', 'B']);
    expect(labels(`${doc}  A & |`)).toEqual(['A', 'B']);
    expect(labels(`${doc}  B:::|`)).toEqual(['hot', 'cold']);
    expect(labels(`${doc}  class |`)).toEqual(['A', 'B']);
    expect(labels(`${doc}  class A |`)).toEqual(['hot', 'cold']);
    expect(labels(`${doc}  style |`)).toEqual(['A', 'B']);
    expect(labels(`${doc}  subgraph |`)).toEqual([]);
    expect(labels(`${doc}  click |`)).toEqual(['A', 'B']);
  });

  it('after a node: arrows, `&`; mid-arrow: the rest of the arrow', () => {
    const after = complete('flowchart TD\n  A |');
    expect(after.map((i) => i.label)).toEqual(expect.arrayContaining(['-->', '-.->', '==>', '&']));
    expect(after.every((i) => i.kind === 'operator')).toBe(true);
    const mid = complete('flowchart TD\n  A --|');
    expect(mid.map((i) => i.label)).toEqual(['-->', '---', '--o', '--x']);
    expect(mid[0]!.range).toEqual({ start: 17, end: 19 });
    expect(labels('flowchart TD\n  A ==|')).toEqual(['==>', '===']);
  });

  it('right after an id: bracket shapes with the id as the label', () => {
    const items = complete('flowchart TD\n  A --> Bee|');
    expect(items.filter((i) => i.kind === 'shape').map((i) => i.label)).toEqual(
      expect.arrayContaining(['Bee[Bee]', 'Bee(Bee)', 'Bee{Bee}', 'Bee((Bee))'])
    );
  });

  it('inside `@{ }`: keys, then shape names after `shape:`, replacing the typed name', () => {
    expect(labels('flowchart TD\n  A@{ |}')).toEqual(expect.arrayContaining(['shape', 'label']));
    const names = complete('flowchart TD\n  A@{ shape: re|ct }');
    expect(names.map((i) => i.label)).toEqual(['rect', 'rectangle']);
    expect(names[0]!.range).toEqual({ start: 26, end: 30 });
  });

  it('link targets after a url; `href` and `call` after `click id`', () => {
    expect(labels('flowchart TD\n  A\n  click A "https://x" |')).toEqual([
      '_self',
      '_blank',
      '_parent',
      '_top',
    ]);
    expect(labels('flowchart TD\n  A\n  click A |')).toEqual(['href', 'call']);
    expect(labels('flowchart TD\n  linkStyle |')).toEqual(['default']);
  });

  it('nothing in labels, strings, comments and directives', () => {
    expect(labels('flowchart TD\n  A[hel|lo]')).toEqual([]);
    expect(labels('flowchart TD\n  A["x|"]')).toEqual([]);
    expect(labels('flowchart TD\n  %% cl|\n  A')).toEqual([]);
  });

  it('after a closed subgraph’s `end`: the same as with no subgraph', () => {
    const head = 'flowchart TD\n  classDef hot fill:#f00\n  A --> B\n';
    const closed = `${head}  subgraph S\n    C\n  end\n`;
    const plain = `${head}  C\n`;
    for (const tail of [
      '  |',
      '  A|',
      '  st|',
      '  class A |',
      '  classDef |',
      '  subgraph |',
      '  click A |',
      '  style A|',
    ]) {
      const want = labels(plain + tail).filter((l) => l !== 'S');
      if (tail !== '  subgraph |') expect(want.length, tail).toBeGreaterThan(0);
      expect(
        labels(closed + tail).filter((l) => l !== 'S'),
        tail
      ).toEqual(want);
    }
  });

  it('at the start of an `end` followed by a statement: replaces `end` only (#36 review)', () => {
    const { doc, offset } = at('flowchart LR\n  subgraph a\n    a1\n  |end\n  C --> D\n');
    const items = doc.completions(offset);
    expect(items.map((i) => i.label)).toContain('end');
    for (const i of items) expect(doc.text.slice(i.range.start, i.range.end)).toBe('end');
  });

  it('after `direction `: the directions', () => {
    const dirs = ['TB', 'TD', 'BT', 'LR', 'RL'];
    expect(labels('flowchart TD\n  A\n  direction |')).toEqual(dirs);
    expect(labels('flowchart TD\n  subgraph S\n    direction |\n  end')).toEqual(dirs);
    expect(labels('flowchart TD\n  A\n  direction T|')).toEqual(['TB', 'TD']);
  });

  it('no node shapes after a word that lexes as a keyword', () => {
    expect(complete('flowchart TD\n  A --> end|').filter((i) => i.kind === 'shape')).toEqual([]);
  });

  it('after a comma in `class` and `style`: ids, replacing only after the comma', () => {
    const items = complete('flowchart TD\n  A --> B\n  class A,|');
    expect(items.map((i) => i.label)).toEqual(['A', 'B']);
    expect(items[0]!.range).toEqual({ start: 33, end: 33 });
    expect(labels('flowchart TD\n  A --> B\n  style A,|')).toEqual(['A', 'B']);
    expect(labels('flowchart TD\n  A --> B\n  class A,B|')).toEqual(['B']);
  });

  it('keywords carry their doc from the syntax reference', () => {
    const sub = complete('flowchart TD\n  sub|').find((i) => i.label === 'subgraph');
    expect(sub?.documentation).toBe(flowchartDocs[T.Subgraph]);
  });
});

describe('hover', () => {
  const text = [
    'flowchart LR',
    '  classDef hot fill:#f96,stroke:#333',
    '  A(Start) --> B{Is it?}',
    '  B -.->|yes| C:::hot',
    '  C e1@==> A',
    '  subgraph S [Group]',
    '    C',
    '    D@{ shape: proc }',
    '  end',
    '  B ==> S',
  ].join('\n');
  const on = (needle: string, n = 1, delta = 0) => {
    let i = -1;
    for (let k = 0; k < n; k++) i = text.indexOf(needle, i + 1);
    const doc = service.update('file:///h.mmd', text);
    const h = doc.hover(i + delta);
    return h && { text: text.slice(h.range.start, h.range.end), contents: h.contents };
  };

  it('a node id: label, shape, classes, edge counts', () => {
    const h = on('B{');
    expect(h?.text).toBe('B');
    expect(h?.contents).toContain('Is it?');
    expect(h?.contents).toContain('`diamond`');
    expect(h?.contents).toContain('1 in, 2 out');
    expect(on('C:::')?.contents).toMatch(/Class: `hot`/);
  });

  it('a subgraph id: title and member count', () => {
    const h = on('S [');
    expect(h?.contents).toContain('`Group`');
    expect(h?.contents).toContain('2 members');
    expect(on('> S', 1, 2)?.contents).toContain('**subgraph**');
  });

  it('a class: its classDef styles', () => {
    expect(on('hot', 2, 1)?.contents).toContain('classDef hot fill:#f96,stroke:#333');
  });

  it('a keyword: its one-line doc from the syntax reference', () => {
    expect(on('subgraph', 1, 2)).toEqual({
      text: 'subgraph',
      contents: `**\`subgraph\`**\n\n${flowchartDocs[T.Subgraph]}`,
    });
    expect(on('classDef', 1, 1)?.contents).toContain(flowchartDocs[T.ClassDef]);
  });

  it('an arrow: what it draws', () => {
    const h = on('-.->', 1, 1);
    expect(h?.text).toBe('-.->|yes|');
    expect(h?.contents).toContain('dotted line with an arrow head');
  });

  it('`click` and `call`: the click doc; `classDef default` and `:::` say what they are', () => {
    const t = 'flowchart TD\n  A --> B\n  classDef default fill:#f00\n  click A call fn()\n';
    const d = service.update('file:///k.mmd', t);
    const h = (needle: string, delta = 1) => d.hover(t.indexOf(needle) + delta);
    expect(h('click')?.contents).toContain(flowchartDocs[T.ClickKeyword]!);
    expect(h('call')?.contents).toContain(flowchartDocs[T.CallbackName]!);
    expect(h('default', 2)?.contents).toMatch(/every node without a class/);
    expect(h('default', 2)?.contents).not.toMatch(/Used by/);
    expect(flowchartDocs[T.Default]).not.toBe(flowchartDocs[T.LinkStyle]);
    expect(flowchartDocs[T.Interpolate]).not.toBe(flowchartDocs[T.LinkStyle]);
    expect(flowchartDocs[T.StyleSeparator]).toMatch(/:::/);
  });

  it('a shape name, an edge id; nothing on blanks', () => {
    expect(on('proc', 1, 1)?.contents).toMatch(/same as `rect`/);
    expect(on('e1@')?.contents).toContain('`C` → `A`');
    expect(on('  B ==>', 1, 0)).toBeUndefined();
  });
});

describe('stress (pitfall 5: linear on long runs)', () => {
  /** Best CPU time of 5 runs in ms: the time this worker waits for a core is left out. */
  const fastest = (run: () => unknown): number => {
    let best = Infinity;
    for (let t = 0; t < 5; t++) {
      const t0 = process.cpuUsage();
      run();
      const { user, system } = process.cpuUsage(t0);
      best = Math.min(best, (user + system) / 1000);
    }
    return best;
  };
  const SHAPES: [string, (n: number) => string][] = [
    ['line breaks inside shape data', (n) => `flowchart TD\n  A@{${'\n'.repeat(n)}|}`],
    ['blank lines inside shape data', (n) => `flowchart TD\n  A@{${'\n  ,'.repeat(n)} |}`],
    ['blanks on the header line', (n) => `flowchart${' '.repeat(n)}|`],
    ['blanks after a link', (n) => `flowchart TD\n  A -->${' '.repeat(n)}|`],
    ['one long chain', (n) => `flowchart TD\n  A${' --> A'.repeat(n)} --> |`],
    ['many line breaks before a statement', (n) => `flowchart TD\n  A${'\n'.repeat(n)}|`],
    [
      'line breaks in shape data, cursor after a digit',
      (n) => `flowchart TD\n  A@{ label: x,${'\n'.repeat(n)}1|}`,
    ],
    [
      'commas in shape data, cursor after a digit',
      (n) => `flowchart TD\n  A@{ label: x${'\n,'.repeat(n)}1|}`,
    ],
  ];
  it.each(SHAPES)(
    '%s: completion and hover stay linear',
    (_, shape) => {
      const run = (n: number) => {
        const marked = shape(n);
        const offset = marked.indexOf('|');
        const text = marked.slice(0, offset) + marked.slice(offset + 1);
        return fastest(() => {
          const doc = service.update('file:///stress.mmd', text);
          doc.completions(offset);
          doc.hover(offset - 1);
        });
      };
      run(500);
      // 8× the input: linear is 8×, quadratic 64×; 2.5× slack for a loaded machine.
      const small = run(2500);
      const big = run(20000);
      expect(big / Math.max(small, 1)).toBeLessThan(20);
      // Wall-clock limit for a busy machine; the ratio above is the check.
    },
    60_000
  );
});

describe('ER completion of names that need quotes (#124 review)', () => {
  /** The items at `¦` (ER text holds `|`), and the text with an item accepted. */
  function erAt(marked: string) {
    const offset = marked.indexOf('¦');
    const text = marked.slice(0, offset) + marked.slice(offset + 1);
    const items = service.update('file:///er.mmd', text).completions(offset);
    const accept = (label: string): string => {
      const item = items.find((i) => i.label === label)!;
      return text.slice(0, item.range.start) + item.insertText + text.slice(item.range.end);
    };
    return { items, accept };
  }
  /** The error codes of `text`. */
  const errors = (text: string): string[] =>
    service
      .update('file:///er-after.mmd', text)
      .diagnostics()
      .filter((d) => d.severity === 'error')
      .map((d) => d.code);

  it('quotes an entity name with a space, so it reads back as that entity', () => {
    const { items, accept } = erAt('erDiagram\n"my entity" ||--|| B : x\nC ||--|| ¦');
    const item = items.find((i) => i.label === 'my entity');
    expect(item?.insertText).toBe('"my entity"');
    const text = accept('my entity');
    expect(text).toBe('erDiagram\n"my entity" ||--|| B : x\nC ||--|| "my entity"');
    expect(errors(text + ' : y')).toEqual([]);
  });

  it('leaves a name that reads back bare as it is', () => {
    const { items } = erAt('erDiagram\n"my entity" ||--|| B : x\nC ||--|| ¦');
    expect(items.find((i) => i.label === 'B')?.insertText).toBe('B');
  });

  it('quotes a keyword used as a name, and a subgraph name with a space', () => {
    const { items } = erAt(
      'erDiagram\n"end" ||--|| B : x\nsubgraph "my group"\n  D\nend\nC ||--|| ¦'
    );
    expect(items.find((i) => i.label === 'end' && i.kind === 'node')?.insertText).toBe('"end"');
    expect(items.find((i) => i.label === 'my group')?.insertText).toBe('"my group"');
  });

  it('offers no name `class` and `style` cannot take (they read no quotes)', () => {
    const { items } = erAt('erDiagram\n"my entity" ||--|| B : x\nstyle ¦');
    expect(items.map((i) => i.label)).toContain('B');
    expect(items.map((i) => i.label)).not.toContain('my entity');
  });
});
