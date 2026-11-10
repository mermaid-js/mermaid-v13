/**
 * Which fixtures v13 can render: those whose detected type has a v13 package. The rest (the Pele
 * sequence and class diagrams until M3) are set aside and reported, not run and counted as errors.
 */
import { detectType, supportsFormat } from 'mermaid';
import type { Fixture } from './fixtures.ts';
import type { UnsupportedFixture } from './report.ts';

/**
 * True when `type` has a v13 package that renders SVG: a generated-registry row with a `load`,
 * asked through the public API (the same rows e2e's `SUPPORTED_TYPES` lists).
 */
export const isSupported = (type: string): boolean => supportsFormat(type, 'svg');

function detected(source: string): string | undefined {
  try {
    return detectType(source);
  } catch {
    return undefined;
  }
}

/**
 * Splits fixtures by detected type. Text no detector claims stays with the supported ones, so a
 * broken fixture still shows up as a render error. `supports` defaults to `isSupported`; specs pass their own.
 */
export function classifyFixtures(
  fixtures: Fixture[],
  supports: (type: string) => boolean = isSupported
): {
  supported: Fixture[];
  unsupported: UnsupportedFixture[];
} {
  const supported: Fixture[] = [];
  const unsupported: UnsupportedFixture[] = [];
  for (const f of fixtures) {
    const type = detected(f.source);
    if (type === undefined || supports(type)) supported.push(f);
    else unsupported.push({ id: f.id, set: f.set, type });
  }
  return { supported, unsupported };
}
