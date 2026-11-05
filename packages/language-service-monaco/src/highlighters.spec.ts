/**
 * First-paint Monarch tokens per diagram type (D134, #190), run with Monaco's own Monarch
 * lexer: every model of the language is coloured by its detected type's generated Monarch
 * file, loaded when a model of the type first shows up; a type with none gets no colours.
 */
import { firstPartyFacets } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeMonaco } from './testing/fake-monaco.ts';
import type { FakeMonaco } from './testing/fake-monaco.ts';
import { monarchSpans } from './testing/monarch.ts';
import { MONARCH_HIGHLIGHTERS, registerMermaid } from './index.ts';
import type { MermaidRegistration } from './index.ts';

let fake: FakeMonaco;
let reg: MermaidRegistration | undefined;
afterEach(() => reg?.dispose());

async function setUp(): Promise<void> {
  fake = fakeMonaco();
  reg = await registerMermaid(fake.monaco, { delay: 0 });
}

const monarch = () => fake.monarch.get('mermaid') as Monaco.languages.IMonarchLanguage;
const spans = (text: string) => monarchSpans(monarch(), text);

const DOCS = {
  flowchart: 'flowchart LR\n  A --> B\n',
  sequence: 'sequenceDiagram\n  Alice->>Bob: Hi\n',
  class: 'classDiagram\n  class Animal\n',
  state: 'stateDiagram-v2\n  [*] --> Idle\n',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n',
};

describe('the per-type Monarch highlighters (D134)', () => {
  it('has a row for each v13 diagram type', () => {
    expect(Object.keys(MONARCH_HIGHLIGHTERS).sort()).toEqual([
      'class',
      'er',
      'flowchart',
      'sequence',
      'state',
    ]);
  });

  it.each(Object.entries(DOCS))('colours a %s model with its own grammar', async (id, text) => {
    await setUp();
    fake.createModel(`file:///${id}.mmd`, text);
    const header = text.split(/\s/)[0]!;
    await vi.waitFor(() => expect(spans(text)[0]).toBe(`${header}:keyword.mermaid-${id}`));
    expect(spans(text).every((s) => s.endsWith(`.mermaid-${id}`))).toBe(true);
  });

  it('highlights a sequence diagram as sequence, not as flowchart', async () => {
    await setUp();
    fake.createModel('file:///s.mmd', DOCS.sequence);
    await vi.waitFor(() =>
      expect(spans(DOCS.sequence)).toEqual([
        'sequenceDiagram:keyword.mermaid-sequence',
        'Alice:variable.mermaid-sequence',
        '->>:operator.mermaid-sequence',
        'Bob:variable.mermaid-sequence',
        ': Hi:string.mermaid-sequence',
      ])
    );
  });

  it('loads only the types its models have', async () => {
    await setUp();
    fake.createModel('file:///f.mmd', DOCS.flowchart);
    await vi.waitFor(() =>
      expect(spans(DOCS.flowchart)[0]).toBe('flowchart:keyword.mermaid-flowchart')
    );
    const states = Object.keys(monarch().tokenizer);
    expect(states.some((s) => s.startsWith('flowchart__'))).toBe(true);
    for (const other of ['sequence', 'class', 'state', 'er']) {
      expect(states.some((s) => s.startsWith(`${other}__`))).toBe(false);
    }
    expect(spans(DOCS.sequence)).toEqual([]);
  });

  it('colours two models of different types at once', async () => {
    await setUp();
    fake.createModel('file:///f.mmd', DOCS.flowchart);
    fake.createModel('file:///e.mmd', DOCS.er);
    await vi.waitFor(() => {
      expect(spans(DOCS.flowchart)[0]).toBe('flowchart:keyword.mermaid-flowchart');
      expect(spans(DOCS.er)[0]).toBe('erDiagram:keyword.mermaid-er');
    });
  });

  it('re-picks when an edit changes the type', async () => {
    await setUp();
    const model = fake.createModel('file:///x.mmd', DOCS.flowchart);
    await vi.waitFor(() =>
      expect(spans(DOCS.flowchart)[0]).toBe('flowchart:keyword.mermaid-flowchart')
    );
    model.setValue(DOCS.class);
    await vi.waitFor(() => expect(spans(DOCS.class)[0]).toBe('classDiagram:keyword.mermaid-class'));
  });

  it('finds the type after front matter, directives and comments', async () => {
    await setUp();
    const text = '---\ntitle: T\n---\n%%{init: {}}%%\n%% note\nsequenceDiagram\n  A->>B: x\n';
    fake.createModel('file:///fm.mmd', text);
    await vi.waitFor(() =>
      expect(spans(text)).toContain('sequenceDiagram:keyword.mermaid-sequence')
    );
    // The front matter is read as front matter, whatever the type.
    expect(spans(text)[0]).toBe('---:annotation.mermaid');
  });

  it('reads the ER grammar case-insensitively, as its own definition says', async () => {
    await setUp();
    const text = 'erDiagram\n  A |O--O{ B : has\n';
    fake.createModel('file:///er.mmd', text);
    await vi.waitFor(() => expect(spans(text)[0]).toBe('erDiagram:keyword.mermaid-er'));
    // `|O` and `O{` are the cardinalities `|o` and `o{`: the same tokens as lower case.
    const lower = text.replace(/O/g, 'o');
    expect(spans(text).map((x) => x.replace(/O/g, 'o'))).toEqual(spans(lower));
  });

  it.each([
    ['a type with no v13 highlighter', 'pie title Pets\n  "Dogs" : 386\n'],
    ['a type v12 does not know', 'notADiagram\n  A --> B\n'],
    ['a header being typed', 'flo'],
  ])('colours nothing for %s, not as flowchart', async (_label, text) => {
    await setUp();
    fake.createModel('file:///f.mmd', DOCS.flowchart);
    fake.createModel('file:///u.mmd', text);
    await vi.waitFor(() =>
      expect(spans(DOCS.flowchart)[0]).toBe('flowchart:keyword.mermaid-flowchart')
    );
    expect(spans(text)).toEqual([]);
  });

  it('dispatches on the same headers as the service detects', () => {
    const headers = [
      'flowchart LR',
      'flowchart-elk TD',
      'graph TD',
      'sequenceDiagram',
      'classDiagram',
      'classDiagram-v2',
      'stateDiagram',
      'stateDiagram-v2',
      'erDiagram',
      'gitGraph',
      'pie',
      'swimlane-beta',
      'requirementDiagram',
    ];
    for (const h of headers) {
      const detected = firstPartyFacets.find((e) => e.detector(h))?.id;
      const dispatched = Object.entries(MONARCH_HIGHLIGHTERS).find(([, row]) =>
        new RegExp(`^(?:${row.header})`).test(h)
      )?.[0];
      expect(dispatched, h).toBe(
        detected !== undefined && detected in MONARCH_HIGHLIGHTERS ? detected : undefined
      );
    }
  });
});
