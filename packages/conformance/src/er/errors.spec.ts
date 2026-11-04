import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from '@mermaid-js/core/parser-kit';
import { parseEr } from '@mermaid-js/diagram-er';
import { loadOracle } from '../oracle.ts';
import { ER_ERRORS } from './error-corpus.ts';

/**
 * The error corpus snapshotted with v12's message next to v13's (DESIGN §11, R-ERR-2): every
 * source is rejected by both, and v13 points at a position with a snippet and caret. The file
 * snapshot is for review.
 */
describe('ER error corpus', () => {
  it('is rejected by both, with v12 and v13 messages side by side', async () => {
    const oracle = await loadOracle();
    const parts = ['# ER errors: v12 and v13', ''];
    for (const [name, source] of ER_ERRORS) {
      const v12 = await oracle.parse(source);
      expect(v12.accepted, `v12 accepts ${name}`).toBe(false);
      const errors = parseEr(source).diagnostics.filter((d) => d.severity === 'error');
      expect(errors.length, `v13 accepts ${name}`).toBeGreaterThan(0);
      parts.push(
        `## ${name}`,
        '',
        '```mermaid',
        source,
        '```',
        '',
        'v12:',
        '',
        '```text',
        v12.accepted ? '' : v12.error,
        '```',
        '',
        'v13:',
        '',
        '```text',
        errors.map((d) => formatDiagnostic(source, d)).join('\n\n'),
        '```',
        ''
      );
    }
    await expect(parts.join('\n')).toMatchFileSnapshot('./__snapshots__/er-errors.md');
  });
});
