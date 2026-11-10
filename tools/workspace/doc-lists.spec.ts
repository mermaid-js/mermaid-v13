import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT } from './diagrams.ts';
import {
  ASCII_DOC,
  ASCII_FRAGMENTS,
  docLists,
  HAND_DRAWN_FRAGMENTS,
  MIGRATION_DOC,
  V12_SKETCHED,
} from './sync.ts';

/**
 * The type lists in ascii.md and in MIGRATION.md's hand-drawn section come from one fragment per
 * type, so a port adds a file and edits neither doc (`docLists` in sync.ts; `pnpm regen` writes
 * them, and sync.spec.ts fails when they are stale).
 */
describe('the type lists in the hand-written docs', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'mermaid-doc-lists-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));
  for (const path of [ASCII_DOC, ASCII_FRAGMENTS, MIGRATION_DOC, HAND_DRAWN_FRAGMENTS]) {
    mkdirSync(join(scratch, path, '..'), { recursive: true });
    cpSync(join(ROOT, path), join(scratch, path), { recursive: true });
  }
  const pending = V12_SKETCHED[0]!;
  writeFileSync(
    join(scratch, ASCII_FRAGMENTS, 'zzdemo.md'),
    [
      '---',
      'intro: "the demo diagram (`zzdemo`, [below](#demo-diagrams))"',
      'cli: "the demo diagram"',
      'size: "the demo diagram\'s"',
      '---',
      '',
      '## Demo diagrams',
      '',
      'The demo section.',
      '',
    ].join('\n')
  );
  writeFileSync(join(scratch, HAND_DRAWN_FRAGMENTS, `${pending}.md`), `${pending} (its boxes)\n`);
  const files = docLists(scratch);

  it("adds a new type's fragment to each ascii.md list and its section after the others", () => {
    const ascii = files.get(ASCII_DOC)!;
    expect(ascii).toContain(
      ', `info` and the demo diagram (`zzdemo`, [below](#demo-diagrams))<!-- END ascii-list:intro -->'
    );
    expect(ascii).toContain('the Ishikawa diagram and the demo diagram<!-- END ascii-list:cli -->');
    expect(ascii).toContain("info's or the demo diagram's<!-- END ascii-list:size -->");
    const demo = ascii.indexOf('## Demo diagrams');
    expect(demo).toBeGreaterThan(ascii.indexOf('## Ishikawa diagrams'));
    expect(demo).toBeLessThan(ascii.indexOf('<!-- END ascii-sections -->'));
  });

  it('moves a v12-sketched type from "not ported yet" to "what is sketched" with its phrase', () => {
    const migration = files.get(MIGRATION_DOC)!;
    expect(migration).toMatch(
      new RegExp(` and ${pending} \\(its boxes\\)<!-- END hand-drawn-list:sketched -->`)
    );
    const left = /BEGIN hand-drawn-list:pending -->(.*)<!-- END/.exec(migration)![1]!;
    expect(left.split(', ')).toEqual(V12_SKETCHED.filter((t) => t !== pending));
  });
});
