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
    expect(labels('|')).toEqual(['flowchart', 'graph']);
    expect(complete('flo|')).toEqual([
      expect.objectContaining({ label: 'flowchart', range: { start: 0, end: 3 } }),
    ]);
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

  it('a shape name, an edge id; nothing on blanks', () => {
    expect(on('proc', 1, 1)?.contents).toMatch(/same as `rect`/);
    expect(on('e1@')?.contents).toContain('`C` → `A`');
    expect(on('  B ==>', 1, 0)).toBeUndefined();
  });
});
