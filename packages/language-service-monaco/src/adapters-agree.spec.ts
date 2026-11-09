/**
 * The three adapters show one document the same way: Monaco (this package), the LSP server
 * (in process, over a stream pair) and CodeMirror give the same folds by line and the same
 * semantic tokens by line, all from the service's `lineFoldingRanges`/`lineSemanticTokens`.
 * Before semantic tokens arrive, the two editors paint each diagram type with its own
 * generated grammar (D134): CodeMirror's Lezer parser and Monaco's Monarch tokens give the
 * same category to every character of the diagram, one document per v13 type.
 */
import { PassThrough } from 'node:stream';
import { foldable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { startServer } from '@mermaid-js/language-server';
import {
  loadHighlighter,
  mermaid,
  mermaidLanguage,
  semanticTokenRanges,
} from '@mermaid-js/language-service-codemirror';
import { LineIndex, SEMANTIC_TOKEN_LEGEND } from '@mermaid-js/language-service';
import { preprocess } from '@mermaid-js/core/preprocess';
import type * as Monaco from 'monaco-editor';
import { createConnection } from 'vscode-languageserver/node';
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver-protocol/node';
import type { FoldingRange, SemanticTokens } from 'vscode-languageserver-protocol';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeMonaco } from './testing/fake-monaco.ts';
import { monarchTokens } from './testing/monarch.ts';
import { registerMermaid } from './index.ts';

const DOC = [
  '---',
  'title: Agreement',
  'config:',
  '  theme: dark',
  '---',
  'flowchart LR',
  '  accDescr {',
  '    two lines',
  '    of description',
  '  }',
  '  A["one',
  '     two"] --> B',
  '  subgraph S [Group]',
  '    B --> C',
  '    C@{ shape: rounded,',
  '        label: "x" }',
  '  end',
  '  classDef hot fill:#f00',
  '  class A,B hot',
  '',
].join('\n');

/** One document per v13 type, flowchart's above; each folds somewhere. */
const DOCS: Readonly<Record<string, string>> = {
  flowchart: DOC,
  sequence: [
    '---',
    'title: Agreement',
    '---',
    'sequenceDiagram',
    '  participant Alice',
    '  actor Bob as B',
    '  loop Every minute',
    '    Alice->>Bob: Hi',
    '    Bob-->>Alice: Hello',
    '  end',
    '  Note over Alice,Bob: done',
    '',
  ].join('\n'),
  class: [
    'classDiagram',
    '  class Animal {',
    '    +String name',
    '    +eat(food) bool',
    '  }',
    '  Animal <|-- Duck : is',
    '  class Duck~T~',
    '  classDef hot fill:#f00',
    '',
  ].join('\n'),
  state: [
    'stateDiagram-v2',
    '  [*] --> Idle',
    '  state Busy {',
    '    [*] --> Working',
    '    Working --> [*]',
    '  }',
    '  Idle --> Busy : start',
    '  note right of Idle : waits',
    '',
  ].join('\n'),
  er: [
    'erDiagram',
    '  CUSTOMER ||--o{ ORDER : places',
    '  CUSTOMER {',
    '    string name PK',
    '    int age',
    '  }',
    '  ORDER }|..|{ ITEM : "contains"',
    '',
  ].join('\n'),
  journey: [
    'journey',
    '  title My working day',
    '  accDescr {',
    '    two lines',
    '  }',
    '  section Go to work',
    '    Make tea: 5: Me',
    '    Do work: 1: Me, Cat',
    '  section Go home',
    '    Sit down: 5: Me',
    '',
  ].join('\n'),
  quadrantChart: [
    'quadrantChart',
    '  title Reach and engagement',
    '  accDescr {',
    '    two lines',
    '  }',
    '  x-axis Low Reach --> High Reach',
    '  quadrant-1 "We should expand"',
    '  Campaign A:::hot: [0.3, 0.6] radius: 10',
    '  classDef hot color: #ff3300',
    '',
  ].join('\n'),
  timeline: [
    'timeline TD',
    '  title History of Social Media',
    '  accTitle: Platforms',
    '  accDescr {',
    '    When each platform',
    '    launched',
    '  }',
    '  %% the early years',
    '  section 2002 - 2004',
    '    2002 : LinkedIn',
    '    2004 : Facebook : Google',
    '         : Orkut',
    '',
  ].join('\n'),
  gitGraph: [
    'gitGraph TB:',
    '  accTitle: History',
    '  accDescr {',
    '    two lines',
    '  }',
    '  %% the first commits',
    '  commit id: "A" tag: "v1.0" type: HIGHLIGHT',
    '  branch develop order: 2',
    '  checkout develop',
    '  commit',
    '  checkout main',
    '  merge develop id: "M"',
    '  cherry-pick id: "A" parent: "M"',
    '',
  ].join('\n'),
  pie: [
    'pie showData',
    '  title Pets adopted',
    '  accDescr {',
    '    Pets adopted',
    '    by volunteers',
    '  }',
    '  %% counted in May',
    '  "Dogs" : 386',
    "  'Cats' : 85.5",
    '',
  ].join('\n'),
  info: [
    'info showInfo',
    '  title Version',
    '  accDescr {',
    '    The version',
    '    of mermaid',
    '  }',
    '  %% drawn as one line',
    '  %%{init: {"theme": "dark"}}%%',
    '  accTitle: Mermaid version',
    '',
  ].join('\n'),
  mindmap: [
    'mindmap',
    '  root((mindmap))',
    '    %% the branches',
    '    Origins',
    '      ::icon(fa fa-book)',
    '      id1[Long history]',
    '      :::urgent large',
    '    Research',
    '      id2(On effectiveness)',
    '      id3)Cloud(',
    '      id4))Bang((',
    '      id5{{Hexagon}}',
    '      "a string"',
    '',
  ].join('\n'),
  gantt: [
    'gantt',
    '  title A plan',
    '  accDescr {',
    '    two lines',
    '  }',
    '  dateFormat YYYY-MM-DD',
    '  excludes weekends',
    '  %% the first week',
    '  section Design',
    '    Sketch :done, a1, 2024-01-01, 3d',
    '    Review :active, a2, after a1, 2d',
    '  section Build',
    '    Code :crit, b1, 2024-01-08, 5d',
    '  click a1 href "https://example.com"',
    '',
  ].join('\n'),
  packet: [
    'packet-beta',
    '  title UDP datagram',
    '  accTitle: UDP',
    '  accDescr {',
    '    The eight-byte header',
    '    and its data',
    '  }',
    '  %% the header',
    '  0-15: "Source Port"',
    "  16-31: 'Destination Port'",
    '  +16: "Length"',
    '  +16: "Checksum"',
    '  64-95: "Data (variable length)"',
    '',
  ].join('\n'),
  radar: [
    'radar-beta:',
    '  title Skills',
    '  accTitle: Skills',
    '  accDescr {',
    '    two lines',
    '  }',
    '  %% the axes',
    '  axis a["Speed"], b["Power"], c',
    '  curve x["Ann"]{1, 2.5, 3}, y{ a: 3, b: 2, c: 1 }',
    '  graticule polygon',
    '  showLegend true',
    '  ticks 4',
    '  max 5',
    '  min 0',
    '',
  ].join('\n'),
  xychart: [
    'xychart horizontal',
    '  title "Sales Revenue"',
    '  accTitle: Sales',
    '  accDescr {',
    '    two lines',
    '  }',
    '  %% the axes',
    '  x-axis "Month" [jan, feb, "mar 1"]',
    '  y-axis Revenue 4000 --> 11000.5',
    '  bar Sales [5000, 6000, 7500]',
    '  line "Trend" [5000, -6000.25, 7500]; line [1, 2, 3]',
    '',
  ].join('\n'),
  cynefin: [
    'cynefin-beta',
    '  title Incident response',
    '  accDescr {',
    '    two lines',
    '  }',
    '  %% the five domains',
    '  complex',
    '    "Probe"',
    "    'Sense'",
    '  clear',
    '    "Categorise"',
    '  complex --> clear : "stabilise"',
    '',
  ].join('\n'),
  kanban: [
    'kanban',
    '  %% the board',
    '  todo[Todo]',
    '    docs[Write the docs]@{ ticket: MC-1, assigned: knsv, priority: High }',
    '    blog["Blog post"]',
    '    :::urgent',
    '  done[Done]',
    '    ship[Ship it]@{',
    "      assigned: 'knsv'",
    '    }',
    '',
  ].join('\n'),
  sankey: [
    'sankey',
    '',
    '%% the flows',
    'Solar,Electricity,42.5',
    '"Gas, imported",Electricity,88.1',
    '"Gas, imported","The ""heat"" network",54.2',
    'Electricity,"Homes',
    'and offices",97.4',
    'Electricity,Losses,0',
    '',
  ].join('\n'),
  treemap: [
    'treemap-beta',
    '  title Budget',
    '  accTitle: Budget',
    '  accDescr {',
    '    two lines',
    '  }',
    '  %% the sections',
    '  "Operations"',
    '    "Salaries": 700000:::big',
    '    "Rent", 1,000',
    "  'Marketing'",
    '    "Ads": 1.5',
    '  classDef big fill:#f96,stroke:#333;',
    '',
  ].join('\n'),
  wardley: [
    'wardley-beta',
    '  title Tea Shop',
    '  accTitle: Tea',
    '  accDescr {',
    '    two lines',
    '  }',
    '  %% the value chain',
    '  size [1100, 800]',
    '  evolution Genesis -> Custom -> Product -> Commodity',
    '  anchor Business [0.95, 0.63]',
    '  component "Cup of Tea" [0.79, 0.61] label [19, -4] (build)',
    '  component Kettle [0.43, 0.35] inertia',
    '  pipeline Kettle {',
    '    component Electric [0.62]',
    "    component 'Gas' [0.38]",
    '  }',
    '  Business -> "Cup of Tea"',
    '  "Cup of Tea" +<> Kettle; boils',
    "  Kettle +'heat'> Electric",
    '  evolve Kettle 0.62',
    '  note "Standardising" [0.30, 0.49]',
    '  annotations [0.97, 0.25]',
    '  annotation 1,[0.48, 0.85] "Hot"',
    '  accelerator Speed [0.5, 0.2]',
    '',
  ].join('\n'),
  venn: [
    'venn-beta',
    '  title Team skills',
    '  %% the sets',
    '  set A["Frontend"]: 12',
    '    text React',
    '  set "B b"',
    '  union A, "B b"["Both"]: 2.5',
    '    text "shared"',
    '  text A note[Note]',
    '  style A fill:#ff6b6b, stroke:rgb(1, 2, 3), stroke-width:4px',
    '',
  ].join('\n'),
};

/** Monarch token type (without its postfix) → the Lezer node name for the same category. */
const MONARCH_CATEGORY: Readonly<Record<string, string>> = {
  keyword: 'Keyword',
  string: 'String',
  operator: 'Operator',
  number: 'Number',
  comment: 'Comment',
  delimiter: 'Punctuation',
  variable: 'Variable',
  constant: 'Constant',
  annotation: 'Meta',
  function: 'Function',
};

/** The category of each character of the diagram (after front matter) in CodeMirror. */
function lezerCategories(text: string): string[] {
  const out: string[] = Array.from({ length: text.length }, () => 'Other');
  mermaidLanguage()
    .language.parser.parse(text)
    .iterate({
      enter: (n) => {
        if (n.type.isTop || n.name === 'token') return;
        for (let i = n.from; i < n.to; i++) out[i] = n.name;
      },
    });
  return out;
}

/** The category of each character in Monaco's Monarch tokens, `id`'s file loaded. */
async function monarchCategories(id: string, text: string): Promise<string[]> {
  const fake = fakeMonaco();
  const reg = await registerMermaid(fake.monaco, { delay: 0 });
  try {
    fake.createModel(`file:///${id}.mmd`, text);
    const def = () => fake.monarch.get('mermaid') as Monaco.languages.IMonarchLanguage;
    await vi.waitFor(() => expect(Object.keys(def().tokenizer)).toContain(`${id}__root`));
    const index = new LineIndex(text);
    const out: string[] = Array.from({ length: text.length }, () => 'Other');
    for (const t of monarchTokens(def(), text)) {
      const category = MONARCH_CATEGORY[t.type.split('.')[0]!] ?? 'Other';
      const from = index.offset(t.line, t.start);
      for (let i = from; i < from + t.end - t.start; i++) out[i] = category;
    }
    return out;
  } finally {
    reg.dispose();
  }
}

const types: readonly string[] = SEMANTIC_TOKEN_LEGEND.types;
const modifiers: readonly string[] = SEMANTIC_TOKEN_LEGEND.modifiers;

/** `line:char+length type mods`, 0-based, from LSP/Monaco-encoded data. */
function decode(data: ArrayLike<number>): string[] {
  const out: string[] = [];
  let line = 0;
  let char = 0;
  for (let i = 0; i + 5 <= data.length; i += 5) {
    const dl = data[i]!;
    line += dl;
    char = dl === 0 ? char + data[i + 1]! : data[i + 1]!;
    const mods = modifiers.filter((_, bit) => data[i + 4]! & (1 << bit));
    out.push(`${line}:${char}+${data[i + 2]} ${[types[data[i + 3]!], ...mods].join(' ')}`);
  }
  return out;
}

async function lspView(text: string): Promise<{ folds: string[]; tokens: string[] }> {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const server = createConnection(
    new StreamMessageReader(toServer),
    new StreamMessageWriter(toClient)
  );
  startServer(server, { facets: [] });
  const client = createProtocolConnection(
    new StreamMessageReader(toClient),
    new StreamMessageWriter(toServer)
  );
  client.listen();
  try {
    await client.sendRequest('initialize', { processId: null, rootUri: null, capabilities: {} });
    await client.sendNotification('initialized', {});
    const uri = 'file:///agree.mmd';
    const published = new Promise<void>((done) =>
      client.onNotification('textDocument/publishDiagnostics', () => done())
    );
    await client.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'mermaid', version: 1, text },
    });
    await published;
    const folds = await client.sendRequest<FoldingRange[]>('textDocument/foldingRange', {
      textDocument: { uri },
    });
    const tokens = await client.sendRequest<SemanticTokens>('textDocument/semanticTokens/full', {
      textDocument: { uri },
    });
    return {
      folds: folds.map((f) => `${f.startLine}-${f.endLine}`),
      tokens: decode(tokens.data),
    };
  } finally {
    client.dispose();
    server.dispose();
  }
}

async function monacoView(text: string): Promise<{ folds: string[]; tokens: string[] }> {
  const fake = fakeMonaco();
  const reg = await registerMermaid(fake.monaco);
  try {
    const model = fake.createModel('file:///agree.mmd', text);
    const token = {} as Monaco.CancellationToken;
    const folding = fake.provider('folding') as Monaco.languages.FoldingRangeProvider;
    const semantic = fake.provider(
      'semanticTokens'
    ) as Monaco.languages.DocumentSemanticTokensProvider;
    const folds = (await folding.provideFoldingRanges(model as never, {}, token)) ?? [];
    const tokens = (await semantic.provideDocumentSemanticTokens(
      model as never,
      null,
      token
    )) as Monaco.languages.SemanticTokens;
    return {
      folds: folds.map((f) => `${f.start - 1}-${f.end - 1}`),
      tokens: decode(tokens.data),
    };
  } finally {
    reg.dispose();
  }
}

async function codeMirrorView(text: string): Promise<{ folds: string[]; tokens: string[] }> {
  const state = EditorState.create({ doc: text, extensions: await mermaid() });
  const folds: string[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const fold = foldable(state, line.from, line.to);
    if (fold) folds.push(`${n - 1}-${state.doc.lineAt(fold.to).number - 1}`);
  }
  const index = new LineIndex(text);
  const tokens = semanticTokenRanges(state, [{ from: 0, to: state.doc.length }]).map((t) => {
    const { line, column } = index.position(t.from);
    const names = t.className.split(' ').map((c) => c.replace('cm-mermaid-', ''));
    return `${line}:${column}+${t.to - t.from} ${names.join(' ')}`;
  });
  return { folds, tokens };
}

describe('Monaco, the LSP server and CodeMirror agree', () => {
  let lsp: { folds: string[]; tokens: string[] };
  beforeAll(async () => {
    lsp = await lspView(DOC);
  }, 30_000);
  afterAll(() => undefined);

  it('on the folds by line, closing lines visible', async () => {
    // Front matter (keeps `---`), accDescr (keeps `}`), the label chain, the subgraph
    // (keeps `end`) and the multi-line `@{ }`.
    expect(lsp.folds).toEqual(['0-3', '6-8', '10-11', '12-15', '14-15']);
    expect((await monacoView(DOC)).folds).toEqual(lsp.folds);
    expect((await codeMirrorView(DOC)).folds).toEqual(lsp.folds);
  });

  it('on the semantic tokens by line', async () => {
    expect(lsp.tokens.length).toBeGreaterThan(20);
    // A continuation piece starts after the indentation (`two` at column 5, not 0).
    expect(lsp.tokens).toContain('11:5+3 string');
    expect((await monacoView(DOC)).tokens).toEqual(lsp.tokens);
    expect((await codeMirrorView(DOC)).tokens).toEqual(lsp.tokens);
  });
});

describe.each(Object.entries(DOCS).filter(([id]) => id !== 'flowchart'))(
  'Monaco, the LSP server and CodeMirror agree on a %s document',
  (_id, text) => {
    it('on the folds and the semantic tokens by line', async () => {
      const lspSide = await lspView(text);
      expect(lspSide.folds.length).toBeGreaterThan(0);
      expect(lspSide.tokens.length).toBeGreaterThan(5);
      expect(await monacoView(text)).toEqual(lspSide);
      expect(await codeMirrorView(text)).toEqual(lspSide);
    }, 30_000);
  }
);

describe('the first paint (D134)', () => {
  beforeAll(async () => {
    for (const id of Object.keys(DOCS)) await loadHighlighter(id);
  });

  it.each(Object.entries(DOCS))(
    'CodeMirror and Monaco colour a %s document alike, with its own grammar',
    async (id, text) => {
      const body = preprocess(text).bodyStart;
      const lezer = lezerCategories(text).slice(body);
      const monarch = (await monarchCategories(id, text)).slice(body);
      // Whitespace is unstyled either way; every other character has one category.
      const shown = (cats: string[]) =>
        cats.map((c, i) => (/\s/.test(text[body + i]!) ? ' ' : c)).join('|');
      expect(shown(monarch)).toEqual(shown(lezer));
      // The header is a keyword: the type's grammar ran, not an empty or other type's one.
      const header = text.slice(body).search(/\S/);
      expect(lezer[header]).toBe('Keyword');
      expect(new Set(lezer).size).toBeGreaterThan(3);
    },
    30_000
  );
});
