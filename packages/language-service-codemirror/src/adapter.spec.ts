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

  it('shows where an unclosed `[` was opened, what was expected and where the text ends', async () => {
    const text = 'flowchart LR\n  A[x\n';
    const [d, ...rest] = lintDiagnostics(await stateOf(text));
    expect(rest).toEqual([]);
    expect(text.slice(d!.from, d!.to)).toBe('[');
    // As core's formatDiagnostic and the LSP server render it.
    expect(d!.message).toContain('\nExpected: label text, `]`');
    expect(d!.message).toContain('\nNote at line 3, column 1: The text ends here.');
    // The related place is one action away.
    expect(d!.actions?.map((a) => a.name)).toEqual(['Line 3: The text ends here.']);
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
    const marks = semanticTokenRanges(state, [{ from: 0, to: state.doc.length }]).map(
      (t) => `${state.sliceDoc(t.from, t.to)}:${t.className}`
    );
    expect(marks).toContain('A:cm-mermaid-node cm-mermaid-declaration cm-mermaid-definition');
    expect(marks).toContain('one:cm-mermaid-subgraph cm-mermaid-declaration cm-mermaid-definition');
  });

  it('marks only what lies in the asked range', async () => {
    const state = await stateOf(TEXT);
    const line = state.doc.line(4);
    for (const t of semanticTokenRanges(state, [line])) {
      expect(t.to).toBeGreaterThan(line.from);
      expect(t.from).toBeLessThan(line.to);
    }
  });
});

describe('semantic tokens over split visible ranges (#35 review)', () => {
  it('gives a token that spans lines once per visible line, without indentation', async () => {
    const text = 'flowchart LR\n  A["line one\n  line two\n  line three"] --> B\n';
    const state = await stateOf(text);
    const label = text.indexOf('line one');
    const end = text.indexOf('"]');
    // A fold hides the middle line: the label runs through both visible ranges.
    const ranges = [
      { from: 0, to: text.indexOf('\n  line two') },
      { from: text.indexOf('\n  line three'), to: text.length },
    ];
    const spans = semanticTokenRanges(state, ranges).filter((t) => t.from >= label && t.to <= end);
    expect(spans.map((t) => state.sliceDoc(t.from, t.to))).toEqual(['line one', 'line three']);
  });
});

describe('typing parses nothing before the debounce (#35 review)', () => {
  /** A service that counts `update` calls. */
  function countingService() {
    const inner = createLanguageService();
    const counter = { updates: 0 };
    const service = {
      ...inner,
      update: (uri: string, text: string) => {
        counter.updates++;
        return inner.update(uri, text);
      },
    };
    return { service, counter };
  }

  it('serves folds from the last snapshot, mapped through the edits', async () => {
    const { service, counter } = countingService();
    let state = await stateOf(TEXT, await mermaid({ service }));
    const gutter = (s: EditorState) => {
      for (let n = 1; n <= s.doc.lines; n++) foldable(s, s.doc.line(n).from, s.doc.line(n).to);
    };
    gutter(state);
    const before = counter.updates;
    for (let i = 0; i < 20; i++) {
      // A keystroke above the subgraph, then the fold gutter's per-line queries.
      state = state.update({ changes: { from: TEXT.indexOf(' --> B'), insert: 'x' } }).state;
      gutter(state);
    }
    expect(counter.updates).toBe(before);
    const line = state.doc.line(3);
    expect(foldable(state, line.from, line.to)).toEqual({
      from: line.to,
      to: state.doc.line(5).to,
    });
  });

  it('keeps the completion list while a word is typed into it', async () => {
    const state = await stateOf(`${TEXT}C`);
    const result = completionSource(new CompletionContext(state, state.doc.length, true));
    const validFor = result?.validFor;
    expect(validFor).toBeInstanceOf(RegExp);
    expect((validFor as RegExp).test('Cab_1')).toBe(true);
    expect((validFor as RegExp).test('C ')).toBe(false);
    expect((validFor as RegExp).test('C-')).toBe(false);
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
