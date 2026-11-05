/**
 * Front-matter config through the service (R-LANG-5, D96): warnings equal what a render warns
 * (core `resolveConfig`, over the corpus front matter and review inputs), scoping follows the
 * renderer's config section, the schema loads with `preload` or comes from the options, and
 * completion stays linear in the front matter's size. More shapes: the goldens in
 * goldens/flowchart (completions, hover, diagnostics).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig } from '@mermaid-js/core/config';
import type { ConfigWarning } from '@mermaid-js/core/config';
import { parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import { configSection } from './config/front-matter.ts';
import { createLanguageService } from './index.ts';
import { contextOf } from './snapshot.ts';
import type { DocumentSnapshot } from './index.ts';
import { configSchema } from './generated/config-schema.gen.ts';

const service = createLanguageService();
beforeAll(() => service.preload());

const labels = (items: readonly { label: string }[]) => items.map((i) => i.label);
/** Text with `|` as the cursor: the snapshot and the cursor offset. */
const open = (src: string, uri = 'file:///fm.mmd'): [DocumentSnapshot, number] => [
  service.update(uri, src.replace('|', '')),
  src.indexOf('|'),
];

// ---------------------------------------------------------------------------- warnings

const isConfigWarning = (code: string) => code.startsWith('CONFIG_') || code === 'LOOK_REMOVED';

/** What a render warns about this text's front-matter config, as `CODE message`. */
function rendered(doc: DocumentSnapshot): string[] {
  const config = preprocess(doc.text).frontMatter?.config;
  if (config === undefined) return [];
  const section = configSection(contextOf(doc));
  const out: ConfigWarning[] = [];
  resolveConfig(CORE_DEFAULTS, {}, config, [], section ? { [section]: {} } : {}, {
    warn: (w) => out.push(w),
    section,
  });
  return out.map((w) => `${w.code} ${w.message}`).sort();
}

/** The service's config warnings, `CODE message` without the "did you mean" hint. */
function ours(doc: DocumentSnapshot): string[] {
  return doc
    .diagnostics()
    .filter((d) => isConfigWarning(d.code))
    .map((d) => `${d.code} ${d.message.replace(/ Did you mean "[^"]*"\?$/, '')}`)
    .sort(); // the service lists them in source order, core in its walk order
}

/** Review inputs: each is the body of `config:` in a flowchart. */
const REVIEW_CASES = [
  'look: neo',
  'flowchart:\n    look: neo',
  'securityLevel: loose',
  'secure: [a]',
  'limits:\n    maxEdges: 1',
  'measurer: x',
  'linkSchemes: [a]',
  'deterministic: true',
  'idPrefix: x',
  'output: {cssVariables: true}',
  'startOnLoad: true\n  maxTextSize: 1\n  maxEdges: 1\n  suppressErrorRendering: true',
  'flowchart: {curve: basis, bogus: 1}',
  'flowchart:\n    - bogus: 1',
  'flowchart:\n    - {curve: basis}\n    - [x]\n    - bogus: 2',
  '__proto__: 1',
  'constructor: 1',
  'toString: 1\n  flowchart:\n    hasOwnProperty: 1',
  '"bogus key": 1',
  'themeVariables: {foo: 1}',
  'flowchart:',
  'flowchart: ~',
  'sequence:\n    bogus: 1',
  'classDiagram:\n    bogus: 1',
  'flowchart:\n    htmlLabels: true',
  'htmlLabels: true',
  'gantt:\n    bogus: 1',
  'fontFamily: x\n  bogus: ""',
  'a: &x {b: 1}\n  bogus: *x',
  'theme: dark\n  themeCSS: "x"',
  'flowchart:\n    look: neo\n  sequence:\n    look: x',
  'elk:\n    look: x\n    bogus: 1',
  'layout: elk\n  elk: {mergeEdges: true}',
  'themeCSS: "<b>"',
  'a.b: 1',
  // YAML with an error: the render reads no config, so there are no config warnings.
  'bogus: 1\n  bogus: 2',
  'theme: dark: bad\n  thme: dark',
];

describe('front-matter config warnings equal a render’s', () => {
  it.each(REVIEW_CASES)('%j', (body) => {
    const [doc] = open(`---\nconfig:\n  ${body}\n---\nflowchart TD\n  A --> B\n`);
    expect(ours(doc)).toEqual(rendered(doc));
  });

  it('over the corpus front matter', () => {
    const root = join(import.meta.dirname, '../../../e2e/diagrams');
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) =>
      f.endsWith('.mmd')
    );
    let compared = 0;
    for (const file of files) {
      const text = readFileSync(join(root, file), 'utf8');
      if (!text.trimStart().startsWith('---')) continue;
      const doc = service.update(`corpus:///${file}`, text);
      expect(ours(doc), file).toEqual(rendered(doc));
      compared++;
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('put each warning on its key, and list items under their index', () => {
    const [doc] = open(
      '---\nconfig:\n  flowchart:\n    - bogus: 1\n  look: x\n---\nflowchart TD\n'
    );
    const at = doc
      .diagnostics()
      .filter((d) => isConfigWarning(d.code))
      .map((d) => `${d.code} ${doc.text.slice(d.range.start, d.range.end)}`);
    expect(at).toEqual(['CONFIG_UNKNOWN_KEY bogus', 'LOOK_REMOVED look']);
  });

  it('accept a third-party diagram its own section, not a first-party type name', async () => {
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
        .filter((d) => isConfigWarning(d.code))
        .map((d) => d.message)
    ).toEqual(['Unknown config key "minee"; ignored.']);
  });

  it('never suggest a key diagram text cannot set', () => {
    const [doc] = open(
      '---\nconfig:\n  securityLevl: x\n  lok: x\n  maxEdgez: 1\n---\nflowchart TD\n'
    );
    const messages = doc.diagnostics().map((d) => d.message);
    expect(messages.join('\n')).not.toMatch(/Did you mean "(securityLevel|look|maxEdges)"/);
  });
});

// ---------------------------------------------------------------------------- YAML errors

describe('front-matter YAML errors (D91, D96, #168)', () => {
  const yamlOf = (doc: DocumentSnapshot) =>
    doc
      .diagnostics()
      .filter((d) => d.code.startsWith('YAML_'))
      .map((d) => `${d.code} ${doc.text.slice(d.range.start, d.range.end)}`);
  /** The tree mode's own read of the text's front matter, as `CODE text`. */
  const treeOf = (text: string) => {
    const fm = preprocess(text).frontMatter!;
    const read = parseYaml(text, { ...fm.yamlRange, tree: true });
    return read.diagnostics.map((d) => `${d.code} ${text.slice(d.range.start, d.range.end)}`);
  };

  it('shows every bad line, where the renderer shows the first (the issue’s example)', () => {
    const text = '---\nconfig:\n  theme: dark: bad\n  layout: "x\n---\nflowchart TD\n  A\n';
    const [doc] = open(text);
    const editor = doc.diagnostics().filter((d) => d.code.startsWith('YAML_'));
    expect(editor).toHaveLength(2);
    // Each on its own line: the second and the third of the text.
    const lineOf = (at: number) => text.slice(0, at).split('\n').length;
    expect(editor.map((d) => lineOf(d.range.start))).toEqual([3, 4]);
    // The renderer (preprocess) keeps the first error only (D91).
    const render = preprocess(text).diagnostics.filter((d) => d.code.startsWith('YAML_'));
    expect(render).toHaveLength(1);
    expect(editor[0]).toEqual(render[0]);
  });

  it('gives N errors for N bad lines', () => {
    for (const n of [1, 3, 10]) {
      const bad = Array.from({ length: n }, (_, i) => `  k${i}: a: b\n  ok${i}: 1\n`).join('');
      const text = `---\nconfig:\n${bad}---\nflowchart TD\n  A\n`;
      const [doc] = open(text);
      expect(yamlOf(doc), `n=${n}`).toHaveLength(n);
      expect(yamlOf(doc)).toEqual(treeOf(text));
    }
  });

  it('equal the tree mode’s, once each, whether the facet reports preprocess or not', async () => {
    const text = '---\na: [1\nb: c: d\nc: 1\nc: 2\n---\n%%{init: {"a" 1}}%%\nflowchart TD\n  A[x\n';
    const [doc] = open(text);
    expect(yamlOf(doc)).toEqual(treeOf(text));
    expect(yamlOf(doc).length).toBeGreaterThan(1);
    // The other diagnostics stay, in source order.
    const codes = doc.diagnostics().map((d) => d.code);
    expect(codes.filter((c) => !c.startsWith('YAML_'))).toEqual(['INVALID_DIRECTIVE', 'UNCLOSED']);
    const starts = doc.diagnostics().map((d) => d.range.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    // A facet that leaves preprocess to the service gets the same YAML errors.
    const own = createLanguageService({
      facets: [{ type: 'mine', id: 'mine', detector: (t) => t.startsWith('mine') }],
    });
    await own.preload();
    const mine = own.update('file:///m.mmd', text.replace('flowchart TD', 'mine'));
    expect(yamlOf(mine)).toEqual(treeOf(text));
  });

  it('keeps the warnings preprocess gives besides the errors, once', () => {
    const text = '---\nconfig:\n  __proto__: 1\n  a: b: c\n---\nflowchart TD\n';
    const [doc] = open(text);
    expect(yamlOf(doc)).toEqual(treeOf(text));
  });

  it('gives no tree errors for a front matter without errors, or an unclosed one', () => {
    const [ok] = open('---\nconfig:\n  theme: dark\n---\nflowchart TD\n');
    expect(yamlOf(ok)).toEqual([]);
    // Unclosed: preprocess reads no YAML, so neither does the editor (the body is not YAML).
    const unclosed = '---\nconfig:\n  theme: dark: bad\nflowchart TD\n  A --> B\n';
    const [doc] = open(unclosed);
    const pre = preprocess(unclosed).diagnostics.filter((d) => d.code.startsWith('YAML_'));
    expect(doc.diagnostics().filter((d) => d.code.startsWith('YAML_'))).toEqual(pre);
    expect(doc.diagnostics().map((d) => d.code)).toContain('UNCLOSED_FRONT_MATTER');
  });
});

// ---------------------------------------------------------------------------- completion

describe('completion scoping (D96)', () => {
  const keysAt = (src: string) => {
    const [doc, at] = open(src);
    return labels(doc.completions(at));
  };

  it('offers the section the renderer reads (the package id), and no other', () => {
    const flow = keysAt('---\nconfig:\n  |\n---\nflowchart TD\n  A\n');
    expect(flow).toContain('flowchart');
    expect(flow).not.toContain('sequence');
    expect(flow).not.toContain('gantt');
    const seq = keysAt('---\nconfig:\n  |\n---\nsequenceDiagram\n  A->>B: x\n');
    expect(seq).toContain('sequence');
    expect(seq).not.toContain('flowchart');
    const cls = keysAt('---\nconfig:\n  |\n---\nclassDiagram\n  class A\n');
    expect(cls).toContain('class');
    expect(cls).not.toContain('flowchart');
    // No v13 package: the renderer has no section for these types, so neither has the service.
    for (const head of ['journey', 'stateDiagram-v2', 'info', 'treemap']) {
      const keys = keysAt(`---\nconfig:\n  |\n---\n${head}\n`);
      expect(keys, head).not.toContain('flowchart');
      expect(keys, head).not.toContain('class');
      expect(keys, head).not.toContain('sequence');
      expect(keys, head).toContain('theme');
    }
  });

  it('offers nothing inside another type’s section', () => {
    expect(keysAt('---\nconfig:\n  sequence:\n    |\n---\nflowchart TD\n  A\n')).toEqual([]);
  });

  it('never offers integrator-only keys or `look` (D153)', () => {
    const top = keysAt('---\nconfig:\n  |\n---\nflowchart TD\n');
    for (const key of ['securityLevel', 'secure', 'startOnLoad', 'maxTextSize', 'maxEdges']) {
      expect(top).not.toContain(key);
    }
    expect(top).not.toContain('suppressErrorRendering');
    expect(top).not.toContain('look');
    expect(keysAt('---\nconfig:\n  flowchart:\n    |\n---\nflowchart TD\n')).not.toContain('look');
    expect(keysAt('---\nconfig:\n  look: |\n---\nflowchart TD\n')).toEqual([]);
  });

  it('offers top-level displayMode values only where gantt config is offered', () => {
    expect(keysAt('---\ndisplayMode: |\n---\nflowchart TD\n')).toEqual([]);
    expect(keysAt('---\ndisplayMode: |\n---\n')).toContain('compact');
  });

  it('leaves the diagram text to the facet, and the fences to no one', () => {
    const text = '---\ntitle: x\n---\nflowchart TD\n  A\n';
    const doc = service.update('file:///scope.mmd', text);
    expect(doc.completions(1)).toEqual([]);
    // The facet's (#32): the header keywords, and the header keyword's doc.
    const at = text.indexOf('flowchart');
    expect(doc.completions(at).map((i) => i.label)).toEqual([
      'flowchart',
      'graph',
      'flowchart-elk',
      'swimlane-beta',
    ]);
    expect(doc.hover(at)?.contents).toMatch(/^\*\*`flowchart`\*\*/);
  });
});

describe('completion text', () => {
  it('follows CRLF line ends', () => {
    const [doc, at] = open('---\r\nconfig:\r\n  flowchart:\r\n    |\r\n---\r\nflowchart TD\r\n');
    expect(doc.completions(at).find((i) => i.label === 'subGraphTitleMargin')?.insertText).toBe(
      'subGraphTitleMargin:\r\n      '
    );
  });

  it('follows tab indents', () => {
    const [doc, at] = open('---\nconfig:\n\tflowchart:\n\t\tsub|\n---\nflowchart TD\n');
    expect(doc.completions(at).find((i) => i.label === 'subGraphTitleMargin')?.insertText).toBe(
      'subGraphTitleMargin:\n\t\t\t'
    );
  });
});

describe('unclosed front matter', () => {
  it('runs to the end of the text, with completion and hover inside it', () => {
    const [doc, at] = open('---\nconfig:\n  flowchart:\n    cur|');
    expect(labels(doc.completions(at))).toContain('curve');
    const [atEnd, end] = open('---\nconfig:\n  flowchart:\n    curve: |\n');
    expect(labels(atEnd.completions(end))).toContain('basis');
    const [hovered, h] = open('---\nconfig:\n  flowchart:\n    cu|rve: basis\n');
    expect(hovered.hover(h)?.contents).toContain('**flowchart.curve**');
  });
});

describe('hover', () => {
  it('gives nothing on prototype names', () => {
    for (const src of [
      '---\ntoS|tring: x\n---\nflowchart TD\n',
      '---\nhasOwn|Property: x\n---\nflowchart TD\n',
      '---\nconfig:\n  const|ructor: 1\n---\nflowchart TD\n',
      '---\nconfig:\n  flowchart:\n    toS|tring: 1\n---\nflowchart TD\n',
    ]) {
      const [doc, at] = open(src);
      expect(doc.hover(at), src).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------- schema

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

// ---------------------------------------------------------------------------- stress

describe('stress (R-PARSE-7)', () => {
  /** Best CPU time of 5 runs in ms: the time this worker waits for a core is left out. */
  const fastest = (run: () => unknown): number => {
    let best = Infinity;
    for (let t = 0; t < 5; t++) {
      const t0 = process.cpuUsage();
      run();
      const { user, system } = process.cpuUsage(t0);
      best = Math.min(best, (user + system) / 1000);
    }
    return best;
  };
  /** `n` distinct keys of one length (a longer key is compared with more known keys). */
  const keys = (n: number, indent: string, value: string) =>
    Array.from({ length: n }, (_, i) => `${indent}k${String(i).padStart(6, '0')}: ${value}\n`).join(
      ''
    );
  const SHAPES: [string, (n: number) => string][] = [
    ['many sibling keys in a section', (n) => '  flowchart:\n' + keys(n, '    ', 'basis')],
    ['many blank and comment lines', (n) => '  flowchart:\n' + '\n    # c\n'.repeat(n)],
    ['many unknown keys', (n) => keys(n, '  ', '1')],
    ['many list items', (n) => '  flowchart:\n' + '    - bogus: 1\n'.repeat(n)],
    ['one long key', (n) => `  ${'x'.repeat(n * 10)}: 1\n`],
  ];
  it.each(SHAPES)(
    '%s: completion and diagnostics stay linear',
    (_, shape) => {
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
      // 8× the lines: linear is 8×, quadratic 64×. The bound leaves room for a loaded machine
      // (a parallel `pnpm test`): best of 5, and 2.5× slack over linear.
      const small = run(2500);
      const big = run(20000);
      expect(big / Math.max(small, 1)).toBeLessThan(20);
      // Wall-clock limit for a busy machine; the ratio above is the check.
    },
    60_000
  );
});
