import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../index.ts';

// Architecture reads `iconSize` and `padding` with the config-length reader class, er, state and
// flowchart each keep a copy of (0 up to 10000, numeric strings, one warning per key; #607
// review). No core helper exists yet, so the copy must stay the same reader: only the section
// name and the warning code may differ, and architecture imports its code from `codes.ts`.
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');

describe("architecture's config-length reader", () => {
  it("is class's, renamed", () => {
    const ours = read('packages/diagram-architecture/src/layout/config-length.ts');
    const theirs = read('packages/diagram-class/src/layout/config-length.ts')
      .replaceAll('`class`', '`architecture`')
      .replaceAll('CLASS_CONFIG_IGNORED', 'ARCHITECTURE_CONFIG_IGNORED')
      .replaceAll('`class.${key}`', '`architecture.${key}`')
      .replace(
        "/** A config length the layout can't honour (pitfall 22): it draws with the default instead. */\nconst ARCHITECTURE_CONFIG_IGNORED = 'ARCHITECTURE_CONFIG_IGNORED';\n",
        "import { ARCHITECTURE_CONFIG_IGNORED } from '../codes.ts';\n"
      );
    expect(ours).toBe(theirs);
  });
});
