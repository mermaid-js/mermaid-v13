/**
 * Diagnostics as Monaco markers: every model of the language gets its markers when it opens
 * or is switched to the language, again after edits (debounced, as the CodeMirror linter is,
 * D98), and loses them and its service document when it closes or changes language.
 */
import type { Diagnostic, LanguageService, Severity } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { snapshotOf, toRange } from './convert.ts';
import type { TextModel } from './convert.ts';

const SEVERITIES: Record<Severity, keyof typeof Monaco.MarkerSeverity> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

type MonacoMarkers = Pick<typeof Monaco, 'MarkerSeverity'> & {
  editor: Pick<
    typeof Monaco.editor,
    'getModels' | 'onDidCreateModel' | 'onDidChangeModelLanguage' | 'setModelMarkers'
  >;
};

/** The markers of `diagnostics` on `model`. */
export function toMarkers(
  monaco: Pick<typeof Monaco, 'MarkerSeverity'>,
  model: TextModel,
  diagnostics: readonly Diagnostic[]
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((d) => ({
    severity: monaco.MarkerSeverity[SEVERITIES[d.severity]],
    code: d.code,
    message: d.message,
    source: 'mermaid',
    ...toRange(model, d.range),
    ...(d.related?.length
      ? {
          relatedInformation: d.related.map((r) => ({
            resource: model.uri,
            message: r.message,
            ...toRange(model, r.range),
          })),
        }
      : {}),
  }));
}

/**
 * Keep markers of every `languageId` model in step with the service. Returns the disposable
 * that stops it and clears the markers it set.
 */
export function watchDiagnostics(
  monaco: MonacoMarkers,
  service: LanguageService,
  languageId: string,
  delay = 150
): Monaco.IDisposable {
  const watched = new Map<TextModel, { timer?: ReturnType<typeof setTimeout>; stop(): void }>();
  const publish = (model: TextModel) => {
    monaco.editor.setModelMarkers(
      model,
      languageId,
      toMarkers(monaco, model, snapshotOf(service, model).diagnostics())
    );
  };
  const unwatch = (model: TextModel) => {
    const w = watched.get(model);
    if (!w) return;
    clearTimeout(w.timer);
    w.stop();
    watched.delete(model);
    monaco.editor.setModelMarkers(model, languageId, []);
    service.close(model.uri.toString());
  };
  const watch = (model: TextModel) => {
    if (model.getLanguageId() !== languageId || watched.has(model)) return;
    const changed = model.onDidChangeContent(() => {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => publish(model), delay);
    });
    const disposing = model.onWillDispose(() => unwatch(model));
    const entry: { timer?: ReturnType<typeof setTimeout>; stop(): void } = {
      stop() {
        changed.dispose();
        disposing.dispose();
      },
    };
    watched.set(model, entry);
    publish(model);
  };
  for (const model of monaco.editor.getModels()) watch(model);
  const created = monaco.editor.onDidCreateModel(watch);
  const retyped = monaco.editor.onDidChangeModelLanguage(({ model }) => {
    if (model.getLanguageId() === languageId) watch(model);
    else unwatch(model);
  });
  return {
    dispose() {
      created.dispose();
      retyped.dispose();
      for (const model of [...watched.keys()]) unwatch(model);
    },
  };
}
