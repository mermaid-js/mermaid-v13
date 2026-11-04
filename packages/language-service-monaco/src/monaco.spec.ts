import { createLanguageService, SEMANTIC_TOKEN_LEGEND } from '@mermaid-js/language-service';
import type { LanguageService } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cursor, fakeMonaco } from './testing/fake-monaco.ts';
import type { FakeModel, FakeMonaco } from './testing/fake-monaco.ts';
import { registerMermaid, revealAst, trackAst } from './index.ts';
import type { MermaidRegistration } from './index.ts';

const TOKEN = {} as Monaco.CancellationToken;
const pos = (lineNumber: number, column: number) => ({ lineNumber, column }) as Monaco.Position;
const at = (model: FakeModel, offset: number) => model.getPositionAt(offset);

const FLOW = 'flowchart LR\n  A["one\ntwo"] --> B\n  subgraph S\n    B\n  end\n  A --> C\n';

let fake: FakeMonaco;
let reg: MermaidRegistration;

beforeEach(async () => {
  vi.useFakeTimers();
  fake = fakeMonaco();
  reg = await registerMermaid(fake.monaco);
});
afterEach(() => {
  reg.dispose();
  vi.useRealTimers();
});

describe('registerMermaid', () => {
  it('awaits the service preload before registering anything (D155)', async () => {
    let release!: () => void;
    const service = createLanguageService();
    const preload = vi.spyOn(service, 'preload').mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = r;
        })
    );
    const f = fakeMonaco();
    const pending = registerMermaid(f.monaco, { service });
    await Promise.resolve();
    expect(preload).toHaveBeenCalledOnce();
    expect(f.languages).toEqual([]);
    release();
    const r = await pending;
    expect(r.service).toBe(service);
    expect(f.languages.map((l) => l.id)).toEqual(['mermaid']);
    r.dispose();
  });

  it('registers the language id, Monarch tokens, configuration and every provider', () => {
    expect(fake.languages).toEqual([
      expect.objectContaining({ id: 'mermaid', extensions: ['.mmd', '.mermaid'] }),
    ]);
    const monarch = fake.monarch.get('mermaid') as { tokenizer: Record<string, unknown> };
    expect(Object.keys(monarch.tokenizer)).toContain('frontMatter');
    expect(fake.configurations.get('mermaid')).toMatchObject({ comments: { lineComment: '%%' } });
    const kinds = [...fake.providers].filter(([, l]) => l.length > 0).map(([k]) => k);
    expect(kinds.sort()).toEqual(
      [
        'completion',
        'definition',
        'folding',
        'hover',
        'references',
        'rename',
        'semanticTokens',
      ].sort()
    );
    for (const [, list] of fake.providers) for (const p of list) expect(p.language).toBe('mermaid');
  });

  it('dispose removes everything it registered', () => {
    reg.dispose();
    expect([...fake.providers.values()].flat()).toEqual([]);
    expect(fake.monarch.size).toBe(0);
  });
});

describe('markers', () => {
  it('sets the diagnostics of a mermaid model as markers, 1-based, when it opens', () => {
    const model = fake.createModel('file:///a.mmd', 'flowchart LR\n  A --> \n  B[x\n');
    expect(fake.markers.get('file:///a.mmd')).toEqual([
      expect.objectContaining({
        severity: 8,
        code: 'UNCLOSED',
        startLineNumber: 3,
        startColumn: 4,
        endLineNumber: 3,
        endColumn: 5,
        relatedInformation: [
          expect.objectContaining({ message: 'The text ends here.', startLineNumber: 4 }),
        ],
      }),
    ]);
    expect(model.getVersionId()).toBe(1);
  });

  it('updates markers after an edit, debounced, and clears them when the model closes', () => {
    const model = fake.createModel('file:///b.mmd', 'flowchart LR\n  A --> B\n');
    expect(fake.markers.get('file:///b.mmd')).toEqual([]);
    model.setValue('flowchart LR\n  A[x\n');
    model.setValue('flowchart LR\n  A[x\n  B(y\n');
    expect(fake.markers.get('file:///b.mmd')).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(fake.markers.get('file:///b.mmd')?.length).toBeGreaterThanOrEqual(1);
    model.dispose();
    expect(fake.markers.get('file:///b.mmd')).toEqual([]);
    expect(reg.service.get('file:///b.mmd')).toBeUndefined();
  });

  it('gives N errors N markers', () => {
    const src = 'flowchart LR\n  A[x\n  B --> C\n  D(y\n  E --> F\n';
    fake.createModel('file:///n.mmd', src);
    const want = reg.service.update('n', src).diagnostics().length;
    expect(want).toBeGreaterThanOrEqual(2);
    expect(fake.markers.get('file:///n.mmd')).toHaveLength(want);
  });

  it('leaves models of other languages alone, and follows a language change', () => {
    const model = fake.createModel('file:///c.ts', 'flowchart LR\n  A[x\n', 'typescript');
    expect(fake.markers.has('file:///c.ts')).toBe(false);
    fake.setModelLanguage(model, 'mermaid');
    expect(fake.markers.get('file:///c.ts')).toHaveLength(1);
    fake.setModelLanguage(model, 'plaintext');
    expect(fake.markers.get('file:///c.ts')).toEqual([]);
  });
});

describe('providers', () => {
  it('completes from the service, with Monaco ranges and kinds', () => {
    const model = fake.createModel('file:///d.mmd', FLOW);
    const provider = fake.provider('completion') as Monaco.languages.CompletionItemProvider;
    const list = provider.provideCompletionItems(
      model as never,
      at(model, FLOW.indexOf('C')),
      {} as never,
      TOKEN
    ) as Monaco.languages.CompletionList;
    const a = list.suggestions.find((s) => s.label === 'A');
    expect(a).toMatchObject({
      kind: 4, // Variable
      insertText: 'A',
      detail: 'one\ntwo',
      range: { startLineNumber: 7, startColumn: 9, endLineNumber: 7, endColumn: 10 },
    });
    expect(list.suggestions.find((s) => s.label === 'S')?.kind).toBe(8); // Module
  });

  it('hovers with markdown and a range', () => {
    const model = fake.createModel('file:///e.mmd', FLOW);
    const provider = fake.provider('hover') as Monaco.languages.HoverProvider;
    const h = provider.provideHover(model as never, pos(3, 11), TOKEN) as Monaco.languages.Hover;
    expect(h.range).toEqual({
      startLineNumber: 3,
      startColumn: 11,
      endLineNumber: 3,
      endColumn: 12,
    });
    expect((h.contents[0] as Monaco.IMarkdownString).value).toContain('**node** `B`');
    expect(provider.provideHover(model as never, pos(4, 1), TOKEN)).toBeUndefined();
  });

  it('goes to the definition and lists references', () => {
    const model = fake.createModel('file:///f.mmd', FLOW);
    const def = fake.provider('definition') as Monaco.languages.DefinitionProvider;
    expect(def.provideDefinition(model as never, pos(5, 5), TOKEN)).toEqual([
      {
        uri: model.uri,
        range: { startLineNumber: 3, startColumn: 11, endLineNumber: 3, endColumn: 12 },
      },
    ]);
    const refs = fake.provider('references') as Monaco.languages.ReferenceProvider;
    const all = refs.provideReferences(
      model as never,
      pos(5, 5),
      { includeDeclaration: true },
      TOKEN
    );
    expect((all as Monaco.languages.Location[]).map((l) => l.range.startLineNumber)).toEqual([
      3, 5,
    ]);
    const uses = refs.provideReferences(
      model as never,
      pos(5, 5),
      { includeDeclaration: false },
      TOKEN
    );
    expect((uses as Monaco.languages.Location[]).map((l) => l.range.startLineNumber)).toEqual([5]);
  });

  it('renames, and rejects what the service refuses', () => {
    const model = fake.createModel('file:///g.mmd', FLOW);
    const rename = fake.provider('rename') as Monaco.languages.RenameProvider;
    expect(rename.resolveRenameLocation?.(model as never, pos(5, 5), TOKEN)).toEqual({
      range: { startLineNumber: 5, startColumn: 5, endLineNumber: 5, endColumn: 6 },
      text: 'B',
    });
    const edit = rename.provideRenameEdits(
      model as never,
      pos(5, 5),
      'Z',
      TOKEN
    ) as Monaco.languages.WorkspaceEdit;
    expect(edit.edits).toEqual([
      {
        resource: model.uri,
        versionId: 1,
        textEdit: {
          range: { startLineNumber: 3, startColumn: 11, endLineNumber: 3, endColumn: 12 },
          text: 'Z',
        },
      },
      {
        resource: model.uri,
        versionId: 1,
        textEdit: {
          range: { startLineNumber: 5, startColumn: 5, endLineNumber: 5, endColumn: 6 },
          text: 'Z',
        },
      },
    ]);
    const clash = rename.provideRenameEdits(
      model as never,
      pos(5, 5),
      'A',
      TOKEN
    ) as Monaco.languages.Rejection;
    expect(clash.rejectReason).toMatch(/./);
    const keyword = rename.resolveRenameLocation?.(
      model as never,
      pos(1, 2),
      TOKEN
    ) as Monaco.languages.Rejection;
    expect(keyword.rejectReason).toMatch(/./);
  });

  it('folds subgraphs and multi-line chains by 1-based line, keeping `end` visible', () => {
    const model = fake.createModel('file:///h.mmd', FLOW);
    const folding = fake.provider('folding') as Monaco.languages.FoldingRangeProvider;
    expect(folding.provideFoldingRanges(model as never, {} as never, TOKEN)).toEqual([
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
  });
});

describe('semantic tokens', () => {
  const decode = (data: Uint32Array) => {
    const out: number[][] = [];
    let line = 0;
    let char = 0;
    for (let i = 0; i < data.length; i += 5) {
      const [dl, ds, len, type, mods] = data.slice(i, i + 5);
      line += dl!;
      char = dl === 0 ? char + ds! : ds!;
      out.push([line, char, len!, type!, mods!]);
    }
    return out;
  };

  it('uses the service legend', () => {
    const p = fake.provider('semanticTokens') as Monaco.languages.DocumentSemanticTokensProvider;
    expect(p.getLegend()).toEqual({
      tokenTypes: [...SEMANTIC_TOKEN_LEGEND.types],
      tokenModifiers: [...SEMANTIC_TOKEN_LEGEND.modifiers],
    });
  });

  it('splits a token that spans lines into one token per line (Monaco has no multi-line tokens)', () => {
    const model = fake.createModel('file:///i.mmd', FLOW);
    const p = fake.provider('semanticTokens') as Monaco.languages.DocumentSemanticTokensProvider;
    const result = p.provideDocumentSemanticTokens(
      model as never,
      null,
      TOKEN
    ) as Monaco.languages.SemanticTokens;
    const tokens = decode(result.data);
    const string = SEMANTIC_TOKEN_LEGEND.types.indexOf('string');
    // `one\ntwo`: `one` to the end of line 1 (0-based), `two` at the start of line 2.
    expect(tokens.filter((t) => t[3] === string)).toEqual([
      [1, 5, 3, string, 0],
      [2, 0, 3, string, 0],
    ]);
    const node = SEMANTIC_TOKEN_LEGEND.types.indexOf('node');
    expect(tokens.find((t) => t[3] === node)).toEqual([1, 2, 1, node, 0b11]);
    // Sorted by line and column, as Monaco requires.
    const keys = tokens.map(([l, c]) => l! * 1000 + c!);
    expect(keys).toEqual([...keys].sort((x, y) => x - y));
  });

  it('skips the empty piece of a token that ends at a line start', () => {
    const src = 'flowchart LR\n  A["x\n"] --> B\n';
    const model = fake.createModel('file:///j.mmd', src);
    const p = fake.provider('semanticTokens') as Monaco.languages.DocumentSemanticTokensProvider;
    const result = p.provideDocumentSemanticTokens(
      model as never,
      null,
      TOKEN
    ) as Monaco.languages.SemanticTokens;
    for (const t of decode(result.data)) expect(t[2]).toBeGreaterThan(0);
  });
});

/** A stand-in for a code editor: one model, a cursor, cursor events. */
function fakeEditor(model: FakeModel) {
  let position = pos(1, 1);
  const listeners = new Set<() => void>();
  return {
    getModel: () => model,
    getPosition: () => position,
    setPosition(p: Monaco.IPosition) {
      position = p as Monaco.Position;
      for (const l of listeners) l();
    },
    revealPositionInCenterIfOutsideViewport: vi.fn(),
    focus: vi.fn(),
    onDidChangeCursorPosition(l: () => void) {
      listeners.add(l);
      return { dispose: () => listeners.delete(l) };
    },
    onDidChangeModelContent(l: () => void) {
      return model.onDidChangeContent(l);
    },
  };
}

describe('preview sync', () => {
  it('reports the AST ids at the cursor, innermost first, as it moves', () => {
    const model = fake.createModel('file:///k.mmd', FLOW);
    const editor = fakeEditor(model);
    const seen: (readonly string[])[] = [];
    const d = trackAst(editor as never, reg.service, (ids) => seen.push(ids));
    editor.setPosition(at(model, cursor(FLOW.replace('-> B', '-> |B')).offset));
    expect(seen.at(-1)).toEqual(['n:B', 'e:A>B', 'chain:1']);
    d.dispose();
    editor.setPosition(pos(1, 1));
    expect(seen).toHaveLength(1);
  });

  it('ignores models of other languages and opens no service document for them', () => {
    const model = fake.createModel('file:///other.ts', FLOW, 'typescript');
    const editor = fakeEditor(model);
    const seen: (readonly string[])[] = [];
    const update = vi.spyOn(reg.service, 'update');
    const d = trackAst(editor as never, reg.service, (ids) => seen.push(ids));
    editor.setPosition(pos(3, 11));
    model.setValue(FLOW + '  X --> Y\n');
    vi.advanceTimersByTime(500);
    expect(seen.every((ids) => ids.length === 0)).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(reg.service.get('file:///other.ts')).toBeUndefined();
    d.dispose();
  });

  it('re-parses after an edit once, debounced, not on every keystroke', () => {
    const model = fake.createModel('file:///typing.mmd', FLOW);
    const editor = fakeEditor(model);
    const seen: (readonly string[])[] = [];
    const d = trackAst(editor as never, reg.service, (ids) => seen.push(ids));
    const update = vi.spyOn(reg.service, 'update');
    model.setValue(FLOW + '  X');
    model.setValue(FLOW + '  X -');
    model.setValue(FLOW + '  X --> Y\n');
    expect(update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(update).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
    d.dispose();
  });

  it('closes the service documents it opened when disposed, and only those', () => {
    const f = fakeMonaco();
    const service = createLanguageService();
    const mine = f.createModel('file:///alone.mmd', FLOW);
    const editor = fakeEditor(mine);
    const d = trackAst(editor as never, service, () => undefined);
    editor.setPosition(pos(3, 11));
    expect(service.get('file:///alone.mmd')).toBeDefined();
    const theirs = f.createModel('file:///shared.mmd', FLOW);
    service.update('file:///shared.mmd', FLOW);
    const other = fakeEditor(theirs);
    const d2 = trackAst(other as never, service, () => undefined);
    other.setPosition(pos(3, 11));
    d.dispose();
    d2.dispose();
    expect(service.get('file:///alone.mmd')).toBeUndefined();
    expect(service.get('file:///shared.mmd')).toBeDefined();
  });

  it('moves the cursor to the start of an AST id', () => {
    const model = fake.createModel('file:///l.mmd', FLOW);
    const editor = fakeEditor(model);
    expect(revealAst(editor as never, reg.service, 'n:B')).toBe(true);
    expect(editor.getPosition()).toEqual(pos(3, 11));
    expect(editor.focus).toHaveBeenCalled();
    expect(revealAst(editor as never, reg.service, 'n:nope')).toBe(false);
  });
});

describe('registering twice', () => {
  it('returns the same registration for a language id, ref-counted', async () => {
    const again = await registerMermaid(fake.monaco);
    expect(again.service).toBe(reg.service);
    expect(fake.provider('hover')).toBeDefined(); // still exactly one hover provider
    const model = fake.createModel('file:///twice.mmd', 'flowchart LR\n  A[x\n');
    expect(fake.markers.get('file:///twice.mmd')).toHaveLength(1);
    again.dispose();
    expect(fake.provider('hover')).toBeDefined();
    model.setValue('flowchart LR\n  A[x\n  B(y\n');
    vi.advanceTimersByTime(150);
    expect(fake.markers.get('file:///twice.mmd')?.length).toBeGreaterThanOrEqual(1);
    again.dispose(); // a second dispose of the same handle does nothing
    expect(fake.provider('hover')).toBeDefined();
  });

  it('refuses another service for a language id already registered', async () => {
    await expect(
      registerMermaid(fake.monaco, { service: createLanguageService() })
    ).rejects.toThrow(/already registered/);
  });

  it('registers another language id separately', async () => {
    const other = await registerMermaid(fake.monaco, { languageId: 'mmd2' });
    expect(fake.providers.get('hover')?.map((p) => p.language)).toEqual(['mermaid', 'mmd2']);
    other.dispose();
    expect(fake.providers.get('hover')?.map((p) => p.language)).toEqual(['mermaid']);
  });
});

describe('snapshots', () => {
  it('re-parses only when the text changed (keyed on content)', () => {
    const service: LanguageService = reg.service;
    const update = vi.spyOn(service, 'update');
    const model = fake.createModel('file:///m.mmd', FLOW);
    const calls = update.mock.calls.length;
    const hover = fake.provider('hover') as Monaco.languages.HoverProvider;
    hover.provideHover(model as never, pos(3, 11), TOKEN);
    hover.provideHover(model as never, pos(3, 11), TOKEN);
    expect(update.mock.calls.length).toBe(calls);
    model.setValue(FLOW + '  C --> D\n');
    hover.provideHover(model as never, pos(3, 11), TOKEN);
    expect(update.mock.calls.length).toBe(calls + 1);
  });
});
