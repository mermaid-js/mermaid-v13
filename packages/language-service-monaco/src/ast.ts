/**
 * Cursor ↔ AST ids (R-LANG-6), for a live preview: `trackAst` reports the ids around the
 * cursor as it moves or the text changes (highlight the preview's `[data-ast]` elements);
 * `revealAst` moves the cursor to an id's source (a click on the preview).
 */
import type { AstId, LanguageService } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { snapshotOf } from './convert.ts';

type Editor = Pick<
  Monaco.editor.ICodeEditor,
  | 'getModel'
  | 'getPosition'
  | 'onDidChangeCursorPosition'
  | 'onDidChangeModelContent'
  | 'setPosition'
  | 'revealPositionInCenterIfOutsideViewport'
  | 'focus'
>;

/** The AST ids at `editor`'s cursor, innermost first; none without a model. */
export function astAtCursor(editor: Editor, service: LanguageService): readonly AstId[] {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return [];
  return snapshotOf(service, model).astAt(model.getOffsetAt(position));
}

/** Call `listener` with the AST ids at the cursor whenever the cursor moves or the text changes. */
export function trackAst(
  editor: Editor,
  service: LanguageService,
  listener: (ids: readonly AstId[]) => void
): Monaco.IDisposable {
  const report = () => listener(astAtCursor(editor, service));
  const moved = editor.onDidChangeCursorPosition(report);
  const edited = editor.onDidChangeModelContent(report);
  return {
    dispose() {
      moved.dispose();
      edited.dispose();
    },
  };
}

/** Move the cursor to the start of `id`'s source and focus the editor; false if no such id. */
export function revealAst(editor: Editor, service: LanguageService, id: AstId): boolean {
  const model = editor.getModel();
  const range = model && snapshotOf(service, model).rangeOf(id);
  if (!model || !range) return false;
  const position = model.getPositionAt(range.start);
  editor.setPosition(position);
  editor.revealPositionInCenterIfOutsideViewport(position);
  editor.focus();
  return true;
}
