/**
 * Cursor ↔ AST ids (R-LANG-6), for a live preview: `trackAst` reports the ids around the
 * cursor as it moves or the text changes (highlight the preview's `[data-ast]` elements);
 * `revealAst` moves the cursor to an id's source (a click on the preview).
 */
import type { AstId, LanguageService } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { snapshotOf } from './convert.ts';
import type { TextModel } from './convert.ts';

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

export interface TrackAstOptions {
  /** Only models of this language are read; `mermaid` when omitted. */
  readonly languageId?: string;
  /** Milliseconds after the last edit before the text is parsed again; 150 when omitted. */
  readonly delay?: number;
}

/** The AST ids at `editor`'s cursor, innermost first; none without a model. */
export function astAtCursor(editor: Editor, service: LanguageService): readonly AstId[] {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return [];
  return snapshotOf(service, model).astAt(model.getOffsetAt(position));
}

/**
 * Call `listener` with the AST ids at the cursor when the cursor moves or the text changes.
 * A cursor move over unchanged text answers at once from the current snapshot; an edit
 * re-parses once its typing pauses (`delay`). Models of other languages report no ids and
 * are never parsed. `dispose` closes the service documents this tracker opened.
 */
export function trackAst(
  editor: Editor,
  service: LanguageService,
  listener: (ids: readonly AstId[]) => void,
  options: TrackAstOptions = {}
): Monaco.IDisposable {
  const languageId = options.languageId ?? 'mermaid';
  const delay = options.delay ?? 150;
  const opened = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ours = (model: TextModel | null): model is TextModel =>
    model !== null && model.getLanguageId() === languageId;
  const report = () => {
    timer = undefined;
    const model = editor.getModel();
    if (!ours(model)) {
      listener([]);
      return;
    }
    const uri = model.uri.toString();
    if (service.get(uri) === undefined) opened.add(uri);
    listener(astAtCursor(editor, service));
  };
  /** No edit waits to be parsed: no snapshot yet (parse now), or one of the current text. */
  const settled = (model: TextModel) => {
    const latest = service.get(model.uri.toString());
    return latest === undefined || latest.text === model.getValue();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(report, delay);
  };
  const moved = editor.onDidChangeCursorPosition(() => {
    const model = editor.getModel();
    // Typing moves the cursor too: wait for the edit's parse rather than parse per keystroke.
    if (timer === undefined && (!ours(model) || settled(model))) report();
    else schedule();
  });
  const edited = editor.onDidChangeModelContent(schedule);
  return {
    dispose() {
      clearTimeout(timer);
      moved.dispose();
      edited.dispose();
      for (const uri of opened) service.close(uri);
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
