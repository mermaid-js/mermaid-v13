/**
 * Offsets ↔ Monaco positions, and the snapshot of a model. The service counts UTF-16 offsets
 * into the text; Monaco counts 1-based lines and columns over the same text, so the model's
 * own `getPositionAt` / `getOffsetAt` convert (line breaks as the model holds them).
 */
import type { DocumentSnapshot, LanguageService, Range } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';

export type TextModel = Monaco.editor.ITextModel;

/**
 * The parts of the `monaco` namespace the adapter uses: what both `monaco-editor` and its
 * core-only `monaco-editor/editor/editor.api` entry export.
 */
export type MonacoApi = Pick<typeof Monaco, 'languages' | 'editor' | 'MarkerSeverity'>;

/** A Monaco range for a service range. */
export function toRange(model: TextModel, r: Range): Monaco.IRange {
  const start = model.getPositionAt(r.start);
  const end = model.getPositionAt(r.end);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

/**
 * The service's snapshot of `model`'s current text: the latest one when its text is the
 * model's (keyed on content, never on the model object or version), else a fresh `update`.
 */
export function snapshotOf(service: LanguageService, model: TextModel): DocumentSnapshot {
  const uri = model.uri.toString();
  const text = model.getValue();
  const latest = service.get(uri);
  return latest?.text === text ? latest : service.update(uri, text);
}

/** The service snapshot and the offset of `position` in it. */
export function at(
  service: LanguageService,
  model: TextModel,
  position: Monaco.IPosition
): { doc: DocumentSnapshot; offset: number } {
  return { doc: snapshotOf(service, model), offset: model.getOffsetAt(position) };
}
