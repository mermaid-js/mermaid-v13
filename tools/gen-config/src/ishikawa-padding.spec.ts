import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ishikawaLayoutConfig } from '../../../packages/diagram-ishikawa/src/config.ts';
import { SCHEMA_PATH, sectionDefaults } from './generate.ts';

/**
 * The ishikawa layout's copy of `ishikawa.diagramPadding`'s default (spec #519 T3): the section
 * is `pending` until T5, so core resolves no default for it and `src/config.ts` falls back to
 * its own. That fallback must be the schema's default, which `gen:config` generates once T5 makes
 * the section honoured (and the copy can go).
 */
const SCHEMA = readFileSync(join(import.meta.dirname, '../../..', SCHEMA_PATH), 'utf8');

describe('ishikawa.diagramPadding default', () => {
  it("falls back to the schema's default", () => {
    const { diagramPadding } = sectionDefaults(SCHEMA, 'ishikawa');
    expect(typeof diagramPadding).toBe('number');
    expect(ishikawaLayoutConfig(undefined).diagramPadding).toBe(diagramPadding);
    expect(ishikawaLayoutConfig({ diagramPadding: 'wide' }).diagramPadding).toBe(diagramPadding);
  });

  it("keeps an author's value at or above the schema's minimum", () => {
    expect(ishikawaLayoutConfig({ diagramPadding: 50 }).diagramPadding).toBe(50);
    expect(ishikawaLayoutConfig({ diagramPadding: '0' }).diagramPadding).toBe(0);
  });
});
