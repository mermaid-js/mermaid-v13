// cspell:words Customcolor
/**
 * Test double of the parts of the `monaco` namespace the adapter calls: it records what is
 * registered, holds text models (positions from `LineIndex`, as Monaco counts them: 1-based
 * lines and columns, UTF-16) and the markers set on them. Tests run in plain Node (no DOM,
 * R-ARCH-1); the real editor runs in the Playwright spec (e2e/language/monaco.spec.ts).
 */
import { LineIndex } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';

type Listener<T> = (e: T) => void;

/** A minimal `IDisposable` event emitter. */
class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();
  readonly event = (listener: Listener<T>) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(e: T): void {
    for (const l of [...this.listeners]) l(e);
  }
}

export class FakeModel {
  private text: string;
  private lines: LineIndex;
  private version = 1;
  private readonly changed = new Emitter<unknown>();
  private readonly disposing = new Emitter<void>();
  readonly onDidChangeContent = this.changed.event;
  readonly onWillDispose = this.disposing.event;
  readonly uri: { toString(): string };

  constructor(
    uri: string,
    text: string,
    public languageId = 'mermaid'
  ) {
    this.uri = { toString: () => uri };
    this.text = text;
    this.lines = new LineIndex(text);
  }

  getValue(): string {
    return this.text;
  }
  getLanguageId(): string {
    return this.languageId;
  }
  getVersionId(): number {
    return this.version;
  }
  getPositionAt(offset: number): Monaco.Position {
    const p = this.lines.position(offset);
    return { lineNumber: p.line + 1, column: p.column + 1 } as Monaco.Position;
  }
  getOffsetAt(p: Monaco.IPosition): number {
    return this.lines.offset(p.lineNumber - 1, p.column - 1);
  }
  getLineMaxColumn(line: number): number {
    const start = this.lines.offset(line - 1, 0);
    return this.lines.offset(line - 1, Number.MAX_SAFE_INTEGER) - start + 1;
  }
  /** Replace the whole text, as a user edit would. */
  setValue(text: string): void {
    this.text = text;
    this.lines = new LineIndex(text);
    this.version++;
    this.changed.fire({});
  }
  dispose(): void {
    this.disposing.fire();
  }
}

/** The position of the `|` marker in `src`, and `src` without it. */
export function cursor(src: string): { text: string; offset: number } {
  const offset = src.indexOf('|');
  return { text: src.slice(0, offset) + src.slice(offset + 1), offset };
}

const MarkerSeverity = { Hint: 1, Info: 2, Warning: 4, Error: 8 };
const CompletionItemKind = Object.fromEntries(
  [
    'Method',
    'Function',
    'Constructor',
    'Field',
    'Variable',
    'Class',
    'Struct',
    'Interface',
    'Module',
    'Property',
    'Event',
    'Operator',
    'Unit',
    'Value',
    'Constant',
    'Enum',
    'EnumMember',
    'Keyword',
    'Text',
    'Color',
    'File',
    'Reference',
    'Customcolor',
    'Folder',
    'TypeParameter',
    'User',
    'Issue',
    'Tool',
    'Snippet',
  ].map((k, i) => [k, i])
);

export interface FakeMonaco {
  /** The namespace to pass to the adapter. */
  monaco: typeof Monaco;
  languages: { id: string }[];
  monarch: Map<string, unknown>;
  configurations: Map<string, unknown>;
  /** Registered providers by kind (`completion`, `hover`, …), with their language. */
  providers: Map<string, { language: string; provider: unknown }[]>;
  markers: Map<string, Monaco.editor.IMarkerData[]>;
  /** Add a model, as `monaco.editor.createModel` would. */
  createModel(uri: string, text: string, languageId?: string): FakeModel;
  /** Change a model's language, as `monaco.editor.setModelLanguage` would. */
  setModelLanguage(model: FakeModel, languageId: string): void;
  /** The one provider registered for `kind`. */
  provider(kind: string): unknown;
}

export function fakeMonaco(): FakeMonaco {
  const models: FakeModel[] = [];
  const created = new Emitter<FakeModel>();
  const retyped = new Emitter<{ model: FakeModel; oldLanguage: string }>();
  const providers = new Map<string, { language: string; provider: unknown }[]>();
  const fake: Omit<FakeMonaco, 'monaco'> = {
    languages: [],
    monarch: new Map(),
    configurations: new Map(),
    providers,
    markers: new Map(),
    createModel(uri, text, languageId) {
      const m = new FakeModel(uri, text, languageId);
      models.push(m);
      m.onWillDispose(() => models.splice(models.indexOf(m), 1));
      created.fire(m);
      return m;
    },
    setModelLanguage(model, languageId) {
      const oldLanguage = model.languageId;
      model.languageId = languageId;
      retyped.fire({ model, oldLanguage });
    },
    provider(kind: string) {
      const list = providers.get(kind) ?? [];
      if (list.length !== 1) throw new Error(`${list.length} ${kind} providers`);
      return list[0]!.provider;
    },
  };
  const register = (kind: string) => (language: string, provider: unknown) => {
    const list = providers.get(kind) ?? [];
    const entry = { language, provider };
    list.push(entry);
    providers.set(kind, list);
    return { dispose: () => list.splice(list.indexOf(entry), 1) };
  };
  const languages = {
    register: (l: { id: string }) => fake.languages.push(l),
    getLanguages: () => fake.languages,
    setMonarchTokensProvider: (id: string, def: unknown) => {
      fake.monarch.set(id, def);
      return { dispose: () => fake.monarch.delete(id) };
    },
    setLanguageConfiguration: (id: string, conf: unknown) => {
      fake.configurations.set(id, conf);
      return { dispose: () => fake.configurations.delete(id) };
    },
    registerCompletionItemProvider: register('completion'),
    registerHoverProvider: register('hover'),
    registerDefinitionProvider: register('definition'),
    registerReferenceProvider: register('references'),
    registerRenameProvider: register('rename'),
    registerFoldingRangeProvider: register('folding'),
    registerDocumentSemanticTokensProvider: register('semanticTokens'),
    CompletionItemKind,
  };
  const editor = {
    getModels: () => [...models],
    onDidCreateModel: created.event,
    onDidChangeModelLanguage: retyped.event,
    setModelMarkers: (model: FakeModel, _owner: string, markers: Monaco.editor.IMarkerData[]) => {
      fake.markers.set(model.uri.toString(), markers);
    },
  };
  return {
    ...fake,
    monaco: { languages, editor, MarkerSeverity } as unknown as typeof Monaco,
  };
}
