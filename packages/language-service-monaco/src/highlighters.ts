// cspell:words popall
/**
 * First-paint Monarch tokens per diagram type (D134). Monaco has one tokenizer per language
 * id, and models of one id can hold different diagram types, so the adapter registers one
 * dispatching definition: shared front-matter states, a `detect` state that finds the
 * diagram's first line (after directives and `%%` comments) and switches to that type's
 * states, and every loaded type's generated states renamed `<id>__<state>`. A type's file is
 * imported when a model of the type first shows up, and the definition is registered again
 * with it, so a page that edits only flowcharts loads no other type's file. A header no
 * loaded type claims reads as plain text: semantic tokens only, never another type's colours.
 * Editing a model's header re-picks by itself: Monaco re-tokenizes from the edited line.
 */
import { firstPartyFacets } from '@mermaid-js/language-service';
import type { LanguageService } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { snapshotOf } from './convert.ts';
import type { TextModel } from './convert.ts';

/** One generated Monarch rule: a pattern and its action. */
type MonarchRule = readonly [
  string,
  { readonly token: string; readonly next?: string; readonly switchTo?: string },
];

/** A generated Monarch file (gen-grammar's `<id>.monarch.json`). */
export interface MonarchDefinition {
  readonly tokenPostfix?: string;
  readonly defaultToken?: string;
  readonly ignoreCase?: boolean;
  readonly includeLF?: boolean;
  readonly start?: string;
  readonly tokenizer: Readonly<Record<string, readonly MonarchRule[]>>;
}

export interface MonarchHighlighter {
  /**
   * The pattern the type's detector looks for at the diagram's first line (its
   * `firstPartyFacets` detector without the leading `^\s*`).
   */
  readonly header: string;
  /** Imports the type's generated Monarch file. */
  load(): Promise<MonarchDefinition>;
}

/**
 * Diagram id → its header and its generated Monarch file, imported on demand (D134). A port
 * adds its row here and its id to `scripts/monarch.ts` (`agents/port-diagram/language.md`).
 */
export const MONARCH_HIGHLIGHTERS: Readonly<Record<string, MonarchHighlighter>> = {
  flowchart: {
    header: '(?:graph|flowchart)',
    load: () => import('./generated/flowchart.monarch.js').then((m) => m.default),
  },
  sequence: {
    header: 'sequenceDiagram',
    load: () => import('./generated/sequence.monarch.js').then((m) => m.default),
  },
  class: {
    header: 'classDiagram',
    load: () => import('./generated/class.monarch.js').then((m) => m.default),
  },
  state: {
    header: 'stateDiagram',
    load: () => import('./generated/state.monarch.js').then((m) => m.default),
  },
  er: {
    header: 'erDiagram',
    load: () => import('./generated/er.monarch.js').then((m) => m.default),
  },
};

/** The postfix of the shared states' tokens (front matter, directives, comments). */
const SHARED = '.mermaid';
const KEEP = new Set(['@pop', '@popall', '@push']);

/** `re` matching case-insensitively, a leading `^` (Monarch's line-start marker) kept out. */
function caseless(re: string): string {
  if (re === '') return re;
  return re.startsWith('^') ? `^(?i:${re.slice(1)})` : `(?i:${re})`;
}

/** `def`'s rules of one state, its targets renamed by `target` and its postfix applied. */
function rewrite(
  def: MonarchDefinition,
  rules: readonly MonarchRule[],
  target: (state: string) => string,
  postfix: string
): Monaco.languages.IMonarchLanguageRule[] {
  const to = (t: string) => (KEEP.has(t) || !t.startsWith('@') ? t : `@${target(t.slice(1))}`);
  return rules.map(([re, action]) => [
    def.ignoreCase ? caseless(re) : re,
    {
      token: action.token === '' ? '' : action.token + postfix,
      ...(action.next === undefined ? {} : { next: to(action.next) }),
      ...(action.switchTo === undefined ? {} : { switchTo: to(action.switchTo) }),
    },
  ]);
}

/**
 * The dispatching definition for the `loaded` types (diagram id → generated file), in
 * {@link MONARCH_HIGHLIGHTERS} order.
 */
export function combineMonarch(
  loaded: ReadonlyMap<string, MonarchDefinition>
): Monaco.languages.IMonarchLanguage {
  const ids = Object.keys(MONARCH_HIGHLIGHTERS).filter((id) => loaded.has(id));
  const tokenizer: Record<string, Monaco.languages.IMonarchLanguageRule[]> = {};
  for (const id of ids) {
    const def = loaded.get(id)!;
    for (const [state, rules] of Object.entries(def.tokenizer)) {
      tokenizer[`${id}__${state}`] = rewrite(
        def,
        rules,
        (s) => `${id}__${s}`,
        def.tokenPostfix ?? ''
      );
    }
  }
  // Front matter is the same for every type: the first loaded file's states, ending in
  // `detect` instead of the type's `root`.
  const first = ids[0] === undefined ? undefined : loaded.get(ids[0]);
  const shared = (s: string) => (s === 'root' ? 'detect' : s);
  for (const state of ['frontMatterStart', 'frontMatter']) {
    const rules = first?.tokenizer[state];
    if (first && rules) tokenizer[state] = rewrite(first, rules, shared, SHARED);
  }
  tokenizer.detect = [
    ['[^\\S\\n]*%%\\{.*?\\}%%', { token: `annotation${SHARED}` }],
    ['[^\\S\\n]*%%[^\\n]*', { token: `comment${SHARED}` }],
    ['\\s+', { token: '' }],
    ...ids.map(
      (id): Monaco.languages.IMonarchLanguageRule => [
        `(?=${MONARCH_HIGHLIGHTERS[id]!.header})`,
        { token: '', switchTo: `@${id}__root` },
      ]
    ),
    ['[^\\n]+', { token: '', switchTo: '@plain' }],
  ];
  tokenizer.plain = [
    ['[^\\n]+', { token: '' }],
    ['\\n', { token: '' }],
  ];
  return {
    tokenPostfix: '',
    defaultToken: '',
    includeLF: true,
    start: tokenizer.frontMatterStart ? 'frontMatterStart' : 'detect',
    tokenizer,
  } as Monaco.languages.IMonarchLanguage;
}

interface MonacoTokens {
  languages: Pick<typeof Monaco.languages, 'setMonarchTokensProvider'>;
  editor: Pick<typeof Monaco.editor, 'getModels' | 'onDidCreateModel' | 'onDidChangeModelLanguage'>;
}

/** The diagram id the service detects for `model`, when the id has a highlighter row. */
function highlighterOf(service: LanguageService, model: TextModel): string | undefined {
  const type = snapshotOf(service, model).type;
  const id = firstPartyFacets.find((e) => e.type === type)?.id;
  return id !== undefined && Object.hasOwn(MONARCH_HIGHLIGHTERS, id) ? id : undefined;
}

/**
 * Keep `languageId`'s Monarch definition holding the type of every model of the language:
 * register the dispatching definition, and import a type's file (then register again) when a
 * model of the type opens or an edit (debounced by `delay`) turns a model into one. Returns
 * the disposable that stops it and removes the definition.
 */
export function watchHighlighters(
  monaco: MonacoTokens,
  service: LanguageService,
  languageId: string,
  delay = 150
): Monaco.IDisposable {
  const loaded = new Map<string, MonarchDefinition>();
  const loading = new Set<string>();
  let registration: Monaco.IDisposable | undefined;
  let open = true;
  const register = () => {
    // The old one first: disposing it after would unregister the new one in some hosts.
    registration?.dispose();
    registration = monaco.languages.setMonarchTokensProvider(languageId, combineMonarch(loaded));
  };
  const check = (model: TextModel) => {
    if (!open || model.getLanguageId() !== languageId) return;
    const id = highlighterOf(service, model);
    if (id === undefined || loaded.has(id) || loading.has(id)) return;
    loading.add(id);
    MONARCH_HIGHLIGHTERS[id]!.load().then(
      (def) => {
        loading.delete(id);
        loaded.set(id, def);
        if (open) register();
      },
      // A failed import leaves the type uncoloured; the next check of a model tries again.
      () => loading.delete(id)
    );
  };
  const watched = new Map<TextModel, Monaco.IDisposable>();
  const watch = (model: TextModel) => {
    if (watched.has(model)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = model.onDidChangeContent(() => {
      clearTimeout(timer);
      timer = setTimeout(() => check(model), delay);
    });
    const disposing = model.onWillDispose(() => unwatch(model));
    watched.set(model, {
      dispose() {
        clearTimeout(timer);
        changed.dispose();
        disposing.dispose();
      },
    });
    check(model);
  };
  const unwatch = (model: TextModel) => {
    watched.get(model)?.dispose();
    watched.delete(model);
  };
  register();
  for (const model of monaco.editor.getModels()) watch(model);
  const created = monaco.editor.onDidCreateModel(watch);
  const retyped = monaco.editor.onDidChangeModelLanguage(({ model }) => check(model));
  return {
    dispose() {
      open = false;
      created.dispose();
      retyped.dispose();
      for (const model of [...watched.keys()]) unwatch(model);
      registration?.dispose();
    },
  };
}
