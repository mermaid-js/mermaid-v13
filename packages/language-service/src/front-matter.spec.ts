/**
 * Front-matter config through the service (R-LANG-5, D96): warnings agree with what a render
 * warns (core `resolveConfig`), the schema loads with `preload` or comes from the options,
 * and completion stays linear in the front matter's size. The shapes are the goldens in
 * goldens/flowchart (completions, hover, diagnostics).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig } from '@mermaid-js/core/config';
import type { ConfigWarning } from '@mermaid-js/core/config';
import { preprocess } from '@mermaid-js/core/preprocess';
import { createLanguageService } from './index.ts';
import { configSchema } from './generated/config-schema.gen.ts';
import { readFixture } from './testing/goldens.ts';

const service = createLanguageService();
beforeAll(() => service.preload());

const CONFIG_CODES = new Set(['CONFIG_UNKNOWN_KEY', 'CONFIG_REMOVED_KEY', 'CONFIG_MOVED_KEY']);
const labels = (items: readonly { label: string }[]) => items.map((i) => i.label);

describe('front-matter config warnings', () => {
  it('warn on the keys a render warns about, with the same message', () => {
    const golden = join(import.meta.dirname, '../goldens/flowchart/diagnostics');
    for (const file of ['front-matter-config.mmd', 'front-matter-recovery.mmd']) {
      const text = readFixture(readFileSync(join(golden, file), 'utf8')).text;
      const doc = service.update(`file:///${file}`, text);
      const ours = doc
        .diagnostics()
        .filter((d) => CONFIG_CODES.has(d.code))
        .map((d) => `${d.code} ${d.message.replace(/ Did you mean "[^"]*"\?$/, '')}`);
      const rendered: ConfigWarning[] = [];
      // The render's front-matter config is the default-mode read: whole documents only.
      const config = preprocess(text).frontMatter?.config;
      if (config === undefined) continue;
      resolveConfig(
        CORE_DEFAULTS,
        {},
        config,
        [],
        { flowchart: {} },
        {
          warn: (w) => rendered.push(w),
          section: 'flowchart',
        }
      );
      expect(ours, file).toEqual(
        rendered.filter((w) => CONFIG_CODES.has(w.code)).map((w) => `${w.code} ${w.message}`)
      );
    }
  });

  it('accept a third-party diagram its own section', async () => {
    const own = createLanguageService({
      facets: [{ type: 'mine', id: 'mine', detector: (t) => t.startsWith('mine') }],
    });
    await own.preload();
    const doc = own.update(
      'file:///m.mmd',
      '---\nconfig:\n  mine: { a: 1 }\n  minee: 1\n---\nmine\n'
    );
    expect(
      doc
        .diagnostics()
        .filter((d) => CONFIG_CODES.has(d.code))
        .map((d) => d.message)
    ).toEqual(['Unknown config key "minee"; ignored.']);
  });
});

describe('the config schema', () => {
  const text = '---\nconfig:\n  \n---\nflowchart TD\n  A --> B\n';
  const cursor = text.indexOf('  \n') + 2;

  it('is the generated one, loaded by preload', async () => {
    const cold = createLanguageService();
    expect(cold.update('file:///s.mmd', text).completions(cursor)).toEqual([]);
    await cold.preload({ types: [] });
    expect(labels(cold.update('file:///s.mmd', text).completions(cursor))).toContain('theme');
  });

  it('can be passed in, and then needs no preload', () => {
    const schema = { type: 'object', properties: { only: { type: 'boolean' } } };
    const doc = createLanguageService({ schema }).update('file:///s.mmd', text);
    expect(labels(doc.completions(cursor))).toEqual(['only']);
  });

  it('is the generated artefact, not a copy', () => {
    expect(configSchema.$id).toBe('https://mermaid.js.org/schemas/config.schema.json');
  });
});

describe('scoping (D96)', () => {
  it('offers config.<type> only for the detected type', () => {
    const at = (text: string) => {
      const doc = service.update('file:///scope.mmd', text);
      return labels(doc.completions(text.indexOf('  \n') + 2));
    };
    const flow = at('---\nconfig:\n  \n---\nflowchart TD\n  A\n');
    expect(flow).toContain('flowchart');
    expect(flow).not.toContain('sequence');
    expect(flow).not.toContain('gantt');
    const seq = at('---\nconfig:\n  \n---\nsequenceDiagram\n  A->>B: hi\n');
    expect(seq).toContain('sequence');
    expect(seq).not.toContain('flowchart');
  });

  it('offers nothing inside another type’s section', () => {
    const text = '---\nconfig:\n  sequence:\n    \n---\nflowchart TD\n  A\n';
    const doc = service.update('file:///scope.mmd', text);
    expect(doc.completions(text.indexOf('    \n') + 4)).toEqual([]);
  });

  it('leaves the diagram text to the facet, and the fences to no one', () => {
    const text = '---\ntitle: x\n---\nflowchart TD\n  A\n';
    const doc = service.update('file:///scope.mmd', text);
    expect(doc.completions(1)).toEqual([]);
    expect(doc.completions(text.indexOf('flowchart'))).toEqual([]);
    expect(doc.hover(text.indexOf('flowchart'))).toBeUndefined();
  });
});

describe('stress (R-PARSE-7)', () => {
  const fastest = (run: () => unknown): number => {
    let best = Infinity;
    for (let t = 0; t < 3; t++) {
      const t0 = performance.now();
      run();
      best = Math.min(best, performance.now() - t0);
    }
    return best;
  };
  const SHAPES: [string, (n: number) => string][] = [
    ['many sibling keys', (n) => '  flowchart:\n' + '    curve: basis\n'.repeat(n)],
    ['many blank and comment lines', (n) => '  flowchart:\n' + '\n    # c\n'.repeat(n)],
    ['many unknown keys', (n) => Array.from({ length: n }, (_, i) => `  k${i}: 1\n`).join('')],
    ['one long key', (n) => `  ${'x'.repeat(n * 10)}: 1\n`],
  ];
  it.each(SHAPES)('%s: completion and diagnostics stay linear', (_, shape) => {
    const run = (n: number) => {
      const text = `---\nconfig:\n${shape(n)}    \n---\nflowchart TD\n  A\n`;
      return fastest(() => {
        const doc = service.update('file:///stress.mmd', text);
        doc.diagnostics();
        doc.completions(text.indexOf('    \n---') + 4);
        doc.hover(text.indexOf('    \n---') - 3);
      });
    };
    run(500);
    const small = run(5000);
    const big = run(20000);
    expect(big / Math.max(small, 1)).toBeLessThan(8);
  });
});
