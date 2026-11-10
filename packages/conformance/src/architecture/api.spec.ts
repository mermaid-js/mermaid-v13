import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { renderArchitectureForTest } from '@mermaid-js/diagram-architecture/testing';
import { createMermaid } from 'mermaid';

/**
 * The plugin through the public API (#614), from the generated registry since its manifest
 * landed (#618). Its default engine is `compass` (D284), loaded lazily as any other first-party
 * engine, and the API's render is the package's render entry's, byte for byte.
 */
const SOURCE = `architecture-beta
  accTitle: Shop
  group api(cloud)[API]
  service db(database)[Database] in api
  service server(server)[Server] in api
  junction j
  db:L -[reads]-> R:server
  server:B -- T:j
`;

describe('architecture through createMermaid().render()', () => {
  it('renders with compass, as the package renders it', async () => {
    const m = createMermaid();
    expect(m.detectType(SOURCE)).toBe('architecture');
    const r = await m.render('arch', SOURCE);
    expect(r.diagramType).toBe('architecture');
    expect(r.warnings).toEqual([]);
    assertInert(r.svg);
    expect(r.svg).toContain('aria-roledescription="architecture"');
    expect(r.svg).toContain('<title id="arch-title">Shop</title>');
    const own = await renderArchitectureForTest(SOURCE, { idPrefix: 'arch' });
    // The same drawing: the API only differs in its version stamp.
    expect(r.svg.replace(/data-mermaid-version="[^"]*"/, '')).toBe(
      own.svg.replace(/data-mermaid-version="[^"]*"/, '')
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(SOURCE);
    expect(m.renderSync(SOURCE).diagramType).toBe('architecture');
  });
});
