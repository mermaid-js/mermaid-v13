import { describe, expect, it } from 'vitest';
import { renderKanbanForTest } from '../render/harness.ts';
import { asciiWarnings } from './warnings.ts';

// The kanban text output's drop warnings (D82, R-ASCII-5) for what the SVG has and text has not.
// Each is one `ASCII_DROPPED` per feature kind, naming the AST ids it dropped.
const ctx = { securityLevel: 'default' as const, config: {} as never };

describe('ASCII_DROPPED for accTitle and accDescr (D742, D82)', () => {
  it('names the acc statements, as the other types do', async () => {
    const { model, layout, ast } = await renderKanbanForTest(
      'kanban\n  accTitle: T\n  a\n    b\n  accDescr {\n    D\n  }'
    );
    const warnings = asciiWarnings(model, layout, ctx, ast);
    expect(warnings.map((w) => [w.feature, w.astIds, w.message])).toEqual([
      [
        'accessibility',
        ['accTitle:1', 'accDescr:1'],
        'Text output has no accTitle and accDescr; dropped.',
      ],
    ]);
  });

  it('warns about none without them, or with empty values', async () => {
    for (const src of ['kanban\n  a\n    b', 'kanban\n  accTitle:\n  a']) {
      const { model, layout, ast } = await renderKanbanForTest(src);
      expect(asciiWarnings(model, layout, ctx, ast)).toEqual([]);
    }
  });
});
