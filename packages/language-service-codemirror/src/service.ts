/**
 * The language service inside an editor state: which service and document uri the editor
 * uses, and the snapshot of the current text. The snapshot is taken lazily, once per text,
 * the first time a feature asks for it, so a keystroke that nothing reads costs no parse.
 */
import { Facet, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import { createLanguageService } from '@mermaid-js/language-service';
import type {
  DocumentSnapshot,
  LanguageService,
  PreloadRequest,
} from '@mermaid-js/language-service';

export interface MermaidServiceOptions {
  /** The service to use; a new one per call when omitted. Share one across editors. */
  readonly service?: LanguageService;
  /** The document's uri in the service; unique per call when omitted. */
  readonly uri?: string;
  /** Which facets to load (D155); every first-party facet when omitted. */
  readonly preload?: PreloadRequest;
}

interface ServiceConfig {
  readonly service: LanguageService;
  readonly uri: string;
}

const serviceConfig = Facet.define<ServiceConfig, ServiceConfig | undefined>({
  combine: (values) => values[0],
});

/** The snapshot of one text, taken on first use. */
class LazySnapshot {
  private snapshot: DocumentSnapshot | undefined;
  constructor(
    private readonly config: ServiceConfig,
    private readonly state: EditorState
  ) {}
  get(): DocumentSnapshot {
    return (this.snapshot ??= this.config.service.update(
      this.config.uri,
      this.state.doc.toString()
    ));
  }
}

const snapshotField = StateField.define<LazySnapshot | undefined>({
  create: (state) => {
    const config = state.facet(serviceConfig);
    return config && new LazySnapshot(config, state);
  },
  update: (value, tr) => {
    const config = tr.state.facet(serviceConfig);
    if (!config) return undefined;
    if (!tr.docChanged && value && config === tr.startState.facet(serviceConfig)) return value;
    return new LazySnapshot(config, tr.state);
  },
});

/**
 * The language-service snapshot of the editor's current text, or `undefined` when the state
 * has no {@link mermaidService} extension.
 */
export function mermaidSnapshot(state: EditorState): DocumentSnapshot | undefined {
  return state.field(snapshotField, false)?.get();
}

let nextUri = 0;

/** Closes the editor's document in the service when the view is destroyed. */
const closeOnDestroy = ViewPlugin.define((view) => ({
  destroy() {
    const config = view.state.facet(serviceConfig);
    config?.service.close(config.uri);
  },
}));

/**
 * The service every other feature reads. Waits for `service.preload()` (D155) so the first
 * snapshot is complete: a facet loaded later would leave the editor with generic features.
 * The document is closed in the service when the editor view is destroyed.
 */
export async function mermaidService(options: MermaidServiceOptions = {}): Promise<Extension> {
  const service = options.service ?? createLanguageService();
  await service.preload(options.preload);
  const uri = options.uri ?? `memory://mermaid/${++nextUri}.mmd`;
  return [serviceConfig.of({ service, uri }), snapshotField, closeOnDestroy];
}
