/**
 * The adapter over a plain `EditorState` (no DOM, R-ARCH-1): each feature's mapping from the
 * service to CodeMirror. The DOM side (tooltips, gutters, decorations drawn, the preview)
 * is covered by the Playwright spec on the example editor (e2e/language/codemirror.spec.ts).
 */
import { CompletionContext } from '@codemirror/autocomplete';
import { foldable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { createLanguageService } from '@mermaid-js/language-service';
import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTICS_DELAY,
  completionSource,
  cursorAst,
  hoverAt,
  lintDiagnostics,
  mermaid,
  mermaidService,
  mermaidSnapshot,
  semanticTokenRanges,
} from './index.ts';

const TEXT = [
  'flowchart LR',
  '  A[Start] --> B',
  '  subgraph one',
  '    C --> D',
  '    D --> E',
  '  end',
  '  A --> ',
].join('\n');

async function stateOf(doc: string, ext?: Extension): Promise<EditorState> {
  return EditorState.create({ doc, extensions: ext ?? (await mermaid()) });
}

describe('mermaidService (D155)', () => {
  it('waits for the facets, so the first snapshot is complete', async () => {
    const state = await stateOf(TEXT, await mermaidService());
    const codes = mermaidSnapshot(state)!
      .diagnostics()
      .map((d) => d.code);
    expect(codes).not.toContain('LANGUAGE_NOT_LOADED');
    expect(mermaidSnapshot(state)!.facet?.id).toBe('flowchart');
  });

  it('passes the preload request on', async () => {
    const service = createLanguageService();
    const state = await stateOf(
      TEXT,
      await mermaidService({ service, preload: { types: ['pie'] } })
    );
    const codes = mermaidSnapshot(state)!
      .diagnostics()
      .map((d) => d.code);
    expect(codes).toContain('LANGUAGE_NOT_LOADED');
  });

  it('takes one snapshot per text, and a new one after an edit', async () => {
    const state = await stateOf(TEXT);
    expect(mermaidSnapshot(state)).toBe(mermaidSnapshot(state));
    const moved = state.update({ selection: { anchor: 3 } }).state;
    expect(mermaidSnapshot(moved)).toBe(mermaidSnapshot(state));
    const edited = state.update({ changes: { from: 0, insert: ' ' } }).state;
    expect(mermaidSnapshot(edited)!.text).toBe(` ${TEXT}`);
  });

  it('gives no snapshot without the service extension', () => {
    expect(mermaidSnapshot(EditorState.create({ doc: TEXT }))).toBeUndefined();
  });
});

describe('diagnostics', () => {
  it('debounces by about 150 ms (D98)', () => {
    expect(DIAGNOSTICS_DELAY).toBe(150);
  });

  it('maps every service diagnostic, clamped to the document', async () => {
    const state = await stateOf('flowchart LR\n  A --> (\n  B --> )\n');
    const found = lintDiagnostics(state);
    expect(found.map((d) => [d.severity, d.source, state.sliceDoc(d.from, d.to)])).toEqual(
      mermaidSnapshot(state)!
        .diagnostics()
        .map((d) => [d.severity, d.code, state.sliceDoc(d.range.start, d.range.end)])
    );
    expect(found.length).toBeGreaterThan(0);
    for (const d of found) expect(d.to).toBeLessThanOrEqual(state.doc.length);
  });

  it('is empty for a valid diagram', async () => {
    expect(lintDiagnostics(await stateOf('flowchart LR\n  A --> B\n'))).toEqual([]);
  });
});

describe('completion', () => {
  it('offers node ids after an arrow, replacing the word being typed', async () => {
    const state = await stateOf(`${TEXT}C`);
    const result = completionSource(new CompletionContext(state, state.doc.length, true));
    expect(result?.from).toBe(state.doc.length - 1);
    expect(result?.options.map((o) => o.label)).toContain('C');
    expect(result?.options.find((o) => o.label === 'C')?.type).toBe('variable');
  });

  it('is the completion source of the Mermaid language', async () => {
    const state = await stateOf(TEXT);
    expect(state.languageDataAt('autocomplete', TEXT.length)).toContain(completionSource);
  });

  it('offers nothing where the service has nothing', async () => {
    const state = await stateOf('flowchart LR\n  A["lab');
    expect(completionSource(new CompletionContext(state, state.doc.length, true))).toBeNull();
  });
});

describe('hover', () => {
  it('shows the service hover over its range', async () => {
    const state = await stateOf(TEXT);
    const at = TEXT.indexOf('B');
    const hover = hoverAt(state, at);
    expect(hover).toMatchObject({ from: at, to: at + 1 });
    expect(hover?.markdown).toContain('**node** `B`');
    expect(hoverAt(state, TEXT.indexOf('  subgraph'))).toBeUndefined();
  });
});

describe('folding', () => {
  it('folds a subgraph from its first line, keeping `end` visible', async () => {
    const state = await stateOf(TEXT);
    const line = state.doc.line(3);
    const fold = foldable(state, line.from, line.to);
    expect(fold).toEqual({ from: line.to, to: state.doc.line(5).to });
    expect(foldable(state, state.doc.line(2).from, state.doc.line(2).to)).toBeNull();
  });

  it('folds the front matter', async () => {
    const state = await stateOf('---\ntitle: T\nconfig:\n  theme: dark\n---\nflowchart LR\n  A\n');
    const fold = foldable(state, 0, 3);
    expect(fold).toEqual({ from: 3, to: state.doc.line(4).to });
  });
});

describe('semantic tokens', () => {
  it('marks symbols by kind, with a class per type and modifier', async () => {
    const state = await stateOf(TEXT);
    const marks = semanticTokenRanges(state, 0, state.doc.length).map(
      (t) => `${state.sliceDoc(t.from, t.to)}:${t.className}`
    );
    expect(marks).toContain('A:cm-mermaid-node cm-mermaid-declaration cm-mermaid-definition');
    expect(marks).toContain('one:cm-mermaid-subgraph cm-mermaid-declaration cm-mermaid-definition');
  });

  it('marks only what lies in the asked range', async () => {
    const state = await stateOf(TEXT);
    const line = state.doc.line(4);
    for (const t of semanticTokenRanges(state, line.from, line.to)) {
      expect(t.to).toBeGreaterThan(line.from);
      expect(t.from).toBeLessThan(line.to);
    }
  });
});

describe('cursor → AstId', () => {
  it('gives the AST ids under the cursor, innermost first', async () => {
    const state = (await stateOf(TEXT)).update({
      selection: { anchor: TEXT.indexOf('C -->') },
    }).state;
    expect(cursorAst(state)).toEqual(['n:C', 'e:C>D', 'chain:2', 's:one']);
  });
});
