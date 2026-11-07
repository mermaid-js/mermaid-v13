import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

// Config lengths in the class, ER, state and flowchart builders (M4 follow-up), read as the M4
// ports read them: a number, or a whole numeric string as its number (`"37"`, as v12 took it).
// Anything else (`"37px"`, a negative or a huge number) lays out with the default and warns
// `<TYPE>_CONFIG_IGNORED` once, naming the key.

interface Case {
  readonly section: string;
  readonly code: string;
  readonly text: string;
  /** Config every render of the case takes. */
  readonly base?: Readonly<Record<string, unknown>>;
  /** Each key with a value that changes the drawing. */
  readonly keys: Readonly<Record<string, number>>;
}

const CASES: readonly Case[] = [
  {
    section: 'class',
    code: 'CLASS_CONFIG_IGNORED',
    text: 'classDiagram\n  namespace N {\n    class A\n  }\n  A <|-- B\n  A <|-- D\n  B --> C\n',
    keys: { padding: 31, nodeSpacing: 137, rankSpacing: 137, diagramPadding: 41 },
  },
  {
    section: 'er',
    code: 'ER_CONFIG_IGNORED',
    text: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER ||--o{ ADDRESS : has\n  CUSTOMER {\n    string name\n  }\n',
    keys: {
      minEntityWidth: 237,
      nodeSpacing: 37,
      rankSpacing: 37,
      entityPadding: 31,
      diagramPadding: 41,
    },
  },
  {
    section: 'state',
    code: 'STATE_CONFIG_IGNORED',
    text: 'stateDiagram-v2\n  [*] --> A\n  A --> B\n  A --> C\n  B : a rather long description of state B that wraps\n',
    keys: { wrappingWidth: 61, minNodeWidth: 237, nodeSpacing: 137, rankSpacing: 137 },
  },
  {
    section: 'flowchart',
    code: 'FLOWCHART_CONFIG_IGNORED',
    // The redux themes pad nodes from their own variables; the classic ones from `padding`.
    base: { theme: 'default' },
    text: 'flowchart TD\n  A[a rather long label that wraps somewhere] --> B\n  A --> C\n',
    keys: {
      padding: 31,
      wrappingWidth: 61,
      minNodeWidth: 237,
      nodeSpacing: 137,
      rankSpacing: 137,
      diagramPadding: 41,
    },
  },
];

async function render(
  config: object,
  text: string
): Promise<{ svg: string; warnings: [string, string | undefined][] }> {
  const r = await createMermaid().render('cl', `%%{init: ${JSON.stringify(config)}}%%\n${text}`);
  return { svg: r.svg, warnings: r.warnings.map((w) => [w.code, w.path]) };
}

describe.each(CASES)('$section config lengths', ({ section, code, text, base, keys }) => {
  const withInit = (config: object, t: string) => render({ ...base, ...config }, t);
  it.each(Object.entries(keys))('reads %s as a number or a numeric string', async (key, value) => {
    const unset = await withInit({}, text);
    const number = await withInit({ [section]: { [key]: value } }, text);
    expect(number.svg, 'the value changes the drawing').not.toBe(unset.svg);
    expect(number.warnings).toEqual(unset.warnings);
    const string = await withInit({ [section]: { [key]: ` ${value} ` } }, text);
    expect(string.svg).toBe(number.svg);
    expect(string.warnings).toEqual(unset.warnings);
  });

  it.each(Object.keys(keys))(
    'lays %s out with the default, with one warning, when it is no length',
    async (key) => {
      const unset = await withInit({}, text);
      for (const bad of [`${keys[key]}px`, 'big', -5, 2e4, true]) {
        const r = await withInit({ [section]: { [key]: bad } }, text);
        expect(r.svg, String(bad)).toBe(unset.svg);
        expect(r.warnings, String(bad)).toEqual([...unset.warnings, [code, `${section}.${key}`]]);
      }
    }
  );
});
