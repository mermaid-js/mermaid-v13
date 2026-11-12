/**
 * #618: every key of the `architecture` section has a decided status in the config reference
 * (generated from `config.schema.yaml`), none `pending`: the renderer honours `theme`, `layout`,
 * `useMaxWidth`, `padding` and `iconSize`, and ignores the rest (D153, D328, D507). The inherited
 * `BaseDiagramConfig` keys count too, since a section without its own override shows the base's
 * `pending`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFERENCE_DOC } from './generate.ts';

const doc = readFileSync(join(import.meta.dirname, '../../..', REFERENCE_DOC), 'utf8');
/** `key → status` of the reference's `architecture.*` rows. */
const statuses = Object.fromEntries(
  [...doc.matchAll(/^\| `architecture\.(\w+)` \|(?:[^|]|\\\|)*?\|[^|]*\| ([a-z]+)/gm)].map((m) => [
    m[1]!,
    m[2]!,
  ])
);

describe('architecture config statuses (#618)', () => {
  it('lists the section with no key pending', () => {
    expect(Object.keys(statuses).length).toBeGreaterThan(10);
    expect(Object.entries(statuses).filter(([, s]) => s === 'pending')).toEqual([]);
  });

  it('honours what the renderer reads, and ignores the rest', () => {
    const honoured = Object.keys(statuses).filter((k) => statuses[k] === 'honoured');
    expect(honoured.sort()).toEqual(['iconSize', 'layout', 'padding', 'theme', 'useMaxWidth']);
  });
});
