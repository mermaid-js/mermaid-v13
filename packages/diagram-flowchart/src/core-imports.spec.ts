import { describe, expect, it } from 'vitest';

// Diagram packages reach core through its published subpaths only (DESIGN §2).
describe('core subpaths are importable from a diagram package', () => {
  it.each([
    '@mermaid-js/core',
    '@mermaid-js/core/parser-kit',
    '@mermaid-js/core/layout',
    '@mermaid-js/core/svg',
    '@mermaid-js/core/text',
    '@mermaid-js/core/theme',
    '@mermaid-js/core/config',
  ])('%s', async (specifier) => {
    await expect(import(specifier)).resolves.toBeTypeOf('object');
  });
});
