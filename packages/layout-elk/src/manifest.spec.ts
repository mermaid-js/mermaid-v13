// E5 #243: the package's `layout` manifest (D171, D177), as discovery reads it. Activation through
// the manifest gives what `registerLayoutLoaders(elkLayouts)` gives: the nine names, the `elk`
// fragment and the package's extension (`lineHops`), from the eager `config` module.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readManifest } from '@mermaid-js/core';
import { createMermaid } from 'mermaid';
import elkLayouts, { elkExtension } from './index.ts';
import * as eager from './plugin.ts';
import { configFragment } from './generated/config-fragment.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  mermaid: unknown;
};
const CROSSING = 'flowchart TD\n  A --> C\n  A --> D\n  B --> C\n  B --> D\n';
const doc = `---\nconfig:\n  layout: elk\n---\n${CROSSING}`;

describe('the layout manifest (D177)', () => {
  it('names the nine layouts, the entry and the eager config module', () => {
    expect(readManifest(pkg.mermaid)).toEqual({
      plugin: 'layout',
      names: elkLayouts.map((l) => l.name),
      entry: './dist/index.js',
      config: './dist/plugin.js',
    });
  });

  it('has a config module that exports the fragment and the extension', () => {
    expect(eager.config).toBe(configFragment);
    expect(eager.extension).toBe(elkExtension);
  });

  it('activates as the v12 registration does, lineHops included', async () => {
    const byManifest = createMermaid();
    await byManifest.registerExternalDiagrams([
      {
        manifest: pkg.mermaid,
        load: () => import('./index.ts'),
        config: eager.config,
        extension: eager.extension,
      },
    ]);
    const explicit = createMermaid();
    explicit.registerLayoutLoaders(elkLayouts);
    const r = await byManifest.render('d', doc);
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain('A6,6');
    expect(r.svg).toBe((await explicit.render('d', doc)).svg);
  });
});
