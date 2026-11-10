import { describe, expect, it } from 'vitest';
import { agentflowLanguage, language } from './language.ts';
import { SHAPE_VALUES } from './facet/tables.ts';

/**
 * The agentflow language facet (#549) at its own seam: the parse the service reads, completions
 * at a probe parse, hover and `isValidId`, as the language service calls them. The
 * service-level behaviour (definition, references, rename, folding, astAt, semantic tokens) is
 * in the goldens (`packages/language-service/goldens/agentflow`) and the conformance specs
 * (`packages/conformance/src/agentflow/{probe,service-symbols,service-positions}.spec.ts`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = agentflowLanguage.parse(text, { keepTokens: true, probe: at });
  return agentflowLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Hover markdown at `¦` for the token there (no symbol: keyword, link and shape hovers). */
function hoverToken(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = agentflowLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i] ?? 0;
    const end = tokens.end[i] ?? 0;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
  }
  return agentflowLanguage.hover({ offset: at, ...(token ? { token } : {}) }, { text, result })
    ?.contents;
}

describe('the agentflow facet', () => {
  it('is exported under the name the service imports, with flowchart’s name spaces (D468)', () => {
    expect(language).toBe(agentflowLanguage);
    expect(language.id).toBe('agentflow');
    expect(language.namespaces).toEqual([['node', 'subgraph'], ['class'], ['edge']]);
  });

  it('records vertices and connectors as nodes, flows as subgraphs, classes and edge ids', () => {
    const text =
      'agentflow-beta\nconnector c\nflow f\n  a e1@--> c\nend\nclassDef hot fill:#f00\nf:::hot\n';
    const r = agentflowLanguage.parse(text, { keepTokens: true });
    expect(r.symbols.map((s) => `${s.kind} ${s.role} ${s.name}`)).toEqual([
      'node def c',
      'node def a',
      'edge def e1',
      'node ref c',
      'subgraph def f',
      'class def hot',
      'node ref f',
      'class ref hot',
    ]);
  });
});

describe('the reserved `connectors` id', () => {
  const names = (text: string) =>
    agentflowLanguage.parse(text, { keepTokens: true }).symbols.map((s) => s.name);

  it('is no symbol where it names nothing (v12 makes no node of it)', () => {
    expect(names('agentflow-beta\nconnectors --> b\na --> connectors\n')).toEqual(['b', 'a']);
  });

  it('is one where a connector or a flow takes the id', () => {
    expect(names('agentflow-beta\nconnector connectors\nconnectors --> b\n')).toContain(
      'connectors'
    );
    expect(names('agentflow-beta\nflow connectors\nend\nconnectors --> b\n')).toContain(
      'connectors'
    );
  });
});

describe('agentflow ids (isValidId)', () => {
  it('takes what the parser reads back as one id', () => {
    for (const name of ['a', 'think_2', 'my-node', 'é', 'flows', 'ends', 'connector2'])
      expect(language.isValidId(name, 'node'), name).toBeUndefined();
    expect(language.isValidId('plan', 'subgraph')).toBeUndefined();
    expect(language.isValidId('hot', 'class')).toBeUndefined();
    expect(language.isValidId('e1', 'edge')).toBeUndefined();
  });

  it('refuses keywords, the reserved `connectors`, arrows and blanks', () => {
    for (const k of ['flow', 'connector', 'global', 'end', 'style', 'classDef', 'class'])
      expect(language.isValidId(k, 'node'), k).toBe(`'${k}' is a keyword.`);
    expect(language.isValidId('connectors', 'node')).toMatch(/^'connectors' is reserved/);
    expect(language.isValidId('connectors', 'subgraph')).toMatch(/^'connectors' is reserved/);
    expect(language.isValidId('a-->b', 'node')).toBe("'a-->b' contains an arrow.");
    expect(language.isValidId('a b', 'node')).toBe('An id cannot contain spaces.');
    expect(language.isValidId('', 'class')).toBe('An id cannot be empty.');
    expect(language.isValidId('a[b]', 'node')).toBe("'a[b]' is not a node id.");
    expect(language.isValidId('a,b', 'class')).toBe("'a,b' is not a class name.");
  });
});

describe('agentflow completion', () => {
  it('offers `flow`, `connector` and `global` at a statement start, and `end` only in a block', () => {
    const top = complete('agentflow-beta\n¦\n');
    expect(top).toEqual(expect.arrayContaining(['flow', 'connector', 'global', 'style']));
    expect(top).not.toContain('end');
    expect(complete('agentflow-beta\nglobal\n  ¦\nend\n')).toContain('end');
  });

  it('offers the three links after a node, and the edge-text closers after `--` text', () => {
    expect(complete('agentflow-beta\na ¦')).toEqual(['-->', '--x', '-.-', '&']);
    expect(complete('agentflow-beta\na -- why ¦')).toEqual(['-->', '--x']);
  });

  it('offers the six kind aliases first after `shape:`, every one drawn as written', () => {
    expect(complete('agentflow-beta\na@{ shape: ¦ }').slice(0, 6)).toEqual([
      'task',
      'tool',
      'input',
      'decision',
      'refdoc',
      'action',
    ]);
    for (const { name } of SHAPE_VALUES) {
      const r = agentflowLanguage.parse(`agentflow-beta\na@{ shape: ${name} }\n`, {
        keepTokens: true,
      });
      expect(r.diagnostics, name).toEqual([]);
    }
  });

  it('offers `view: collapsed` in a flow’s metadata, not a node’s', () => {
    expect(complete('agentflow-beta\nflow f@{ ¦ }\nend\n')).toEqual(['view']);
    expect(complete('agentflow-beta\nflow f@{ view: ¦ }\nend\n')).toEqual(['collapsed']);
    expect(complete('agentflow-beta\na@{ ¦ }')).not.toContain('view');
  });
});

describe('agentflow hover', () => {
  it('gives each link its semantic', () => {
    expect(hoverToken('agentflow-beta\na -¦-> b\n')).toMatch(/^\*\*`-->`\*\* sequence/);
    expect(hoverToken('agentflow-beta\na -¦-x b\n')).toMatch(/^\*\*`--x`\*\* failure/);
    expect(hoverToken('agentflow-beta\na -¦.- b\n')).toMatch(/^\*\*`-.-`\*\* reference/);
  });

  it('gives a shape name its kind and drawing, and keywords their docs', () => {
    expect(hoverToken('agentflow-beta\na@{ shape: refd¦oc }\n')).toContain(
      'Kind: `refdoc` · drawn as `lin-doc`'
    );
    expect(hoverToken('agentflow-beta\nglo¦bal\nend\n')).toContain('belong to no flow');
  });
});
