import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildParserFile } from '@lezer/generator';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import type { LRParser } from '@lezer/lr';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';
import { generate, generatedDir, grammarPath } from './generate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const files = generate(read);
const out = (name: string) => files.get(`${generatedDir('flowchart')}/${name}`) ?? '';

const SAMPLE = [
  'flowchart LR',
  '  %% a comment',
  '  A["a label"] -->|go| B(round)',
  '  subgraph one',
  '    C{{hex}} -.-> D',
  '  end',
  '  click A "https://example.com"',
  '  classDef hot fill:#f96',
];

/** [text, kind] pairs a highlighter must produce somewhere in SAMPLE. */
const EXPECTED: [string, string][] = [
  ['flowchart', 'keyword'],
  ['a label', 'string'],
  ['-->', 'operator'],
  ['go', 'string'],
  ['subgraph', 'keyword'],
  ['-.->', 'operator'],
  ['%% a comment', 'comment'],
  ['classDef', 'keyword'],
];

describe('generated highlighters', () => {
  it('are up to date with the grammar file', () => {
    for (const [path, content] of files) expect(read(path), path).toBe(content);
    expect(files.has('v13/docs/syntax/flowchart.md')).toBe(true);
    expect(read(grammarPath('flowchart')).length).toBeGreaterThan(0);
  });

  it('TextMate grammar loads in vscode-textmate and scopes the sample', async () => {
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(join(dirname(require.resolve('vscode-oniguruma')), 'onig.wasm'));
    await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
    const registry = new vsctm.Registry({
      onigLib: Promise.resolve({
        createOnigScanner: (p: string[]) => new oniguruma.OnigScanner(p),
        createOnigString: (s: string) => new oniguruma.OnigString(s),
      }),
      loadGrammar: async () => vsctm.parseRawGrammar(out('flowchart.tmLanguage.json'), 'x.json'),
    });
    const grammar = await registry.loadGrammar('source.mermaid-flowchart');
    expect(grammar).toBeTruthy();
    const seen: [string, string][] = [];
    let state = vsctm.INITIAL;
    for (const line of SAMPLE) {
      const r = (grammar as vsctm.IGrammar).tokenizeLine(line, state);
      for (const t of r.tokens) {
        seen.push([line.slice(t.startIndex, t.endIndex).trim(), t.scopes.join(' ')]);
      }
      state = r.ruleStack;
    }
    const kind: Record<string, string> = {
      keyword: 'keyword.control',
      string: 'string',
      operator: 'keyword.operator',
      comment: 'comment',
    };
    for (const [text, k] of EXPECTED) {
      expect(
        seen.some(([s, scopes]) => s === text && scopes.includes(kind[k] ?? k)),
        `${text} as ${k}`
      ).toBe(true);
    }
  });

  it('Monarch tokenizer is well-formed and scopes the sample', () => {
    const def = JSON.parse(out('flowchart.monarch.json')) as {
      tokenizer: Record<string, [string, { token: string; next?: string; switchTo?: string }][]>;
    };
    // A minimal Monarch interpreter: first matching rule, @pop / @state / switchTo.
    const states = def.tokenizer;
    const seen: [string, string][] = [];
    let stack = ['root'];
    for (const line of SAMPLE) {
      let p = 0;
      for (let guard = 0; p <= line.length && guard < 1000; guard++) {
        const rules = states[stack[stack.length - 1] ?? 'root'] ?? [];
        let hit = false;
        for (const [pattern, action] of rules) {
          const re = new RegExp(pattern, 'y');
          re.lastIndex = p;
          const m = re.exec(line);
          if (!m) continue;
          const next = action.switchTo ?? action.next;
          if (m[0].length === 0 && !next) continue;
          seen.push([m[0].trim(), action.token]);
          if (next === '@pop') stack = stack.length > 1 ? stack.slice(0, -1) : stack;
          else if (action.switchTo) stack = [...stack.slice(0, -1), next?.slice(1) ?? 'root'];
          else if (next) stack = [...stack, next.slice(1)];
          p += m[0].length;
          hit = true;
          break;
        }
        if (p >= line.length) break;
        if (!hit) p++;
      }
      for (const s of Object.keys(states)) expect(states[s]?.length).toBeGreaterThan(0);
    }
    for (const [text, k] of EXPECTED) {
      expect(
        seen.some(([s, token]) => s === text && token === k),
        `${text} as ${k}`
      ).toBe(true);
    }
  });

  it('Lezer grammar builds with lezer-generator and highlights the sample', async () => {
    const built = buildParserFile(out('flowchart.grammar'), {
      fileName: 'flowchart.grammar',
      moduleStyle: 'es',
    });
    // Written where `@lezer/*` resolves, as a consumer's build output would be.
    const dir = join(root, 'tools/gen-grammar/node_modules/.cache/lezer');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'flowchart.parser.js'), built.parser);
    writeFileSync(join(dir, 'flowchart.parser.terms.js'), built.terms);
    writeFileSync(join(dir, 'flowchart.tokens.js'), out('flowchart.tokens.js'));
    const { parser } = (await import(pathToFileURL(join(dir, 'flowchart.parser.js')).href)) as {
      parser: LRParser;
    };
    const text = SAMPLE.join('\n');
    const highlighter = tagHighlighter([
      { tag: tags.keyword, class: 'keyword' },
      { tag: tags.string, class: 'string' },
      { tag: tags.operator, class: 'operator' },
      { tag: tags.lineComment, class: 'comment' },
    ]);
    const seen: [string, string][] = [];
    highlightTree(parser.parse(text), highlighter, (from, to, cls) => {
      seen.push([text.slice(from, to).trim(), cls]);
    });
    for (const [t, k] of EXPECTED) {
      expect(
        seen.some(([s, c]) => s === t && c === k),
        `${t} as ${k}`
      ).toBe(true);
    }
  });
});
