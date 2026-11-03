import { describe, expect, it } from 'vitest';
import {
  CORE_DEFAULTS,
  resolveConfig,
  type ConfigInput,
  type ConfigWarning,
  type MermaidConfig,
} from './index.ts';

const flowchartDefaults = {
  flowchart: { nodeSpacing: 50, rankSpacing: 50, curve: 'basis', theme: 'redux-color' },
} satisfies MermaidConfig;

/** resolveConfig with the warnings collected, the way a render's `ctx.warn` would. */
function resolve(
  sources: {
    initialize?: MermaidConfig;
    frontMatter?: ConfigInput;
    directives?: ConfigInput[];
    pluginDefaults?: MermaidConfig;
  } = {}
) {
  const warnings: ConfigWarning[] = [];
  const config = resolveConfig(
    CORE_DEFAULTS,
    sources.initialize,
    sources.frontMatter,
    sources.directives,
    sources.pluginDefaults,
    { warn: (w) => warnings.push(w) }
  );
  return { config, warnings };
}

const codes = (warnings: ConfigWarning[]) => warnings.map((w) => `${w.code} ${w.path}`);

describe('resolveConfig precedence (mirrors v12 config.spec.ts)', () => {
  it('returns the defaults when nothing else is given', () => {
    const { config, warnings } = resolve();
    expect(config.theme).toBe('redux');
    expect(config.fontSize).toBe(16);
    expect(config.securityLevel).toBe('default');
    expect(warnings).toEqual([]);
  });

  it('applies initialize() over the defaults', () => {
    const { config } = resolve({ initialize: { fontFamily: 'foo-font', fontSize: 150 } });
    expect(config.fontFamily).toBe('foo-font');
    expect(config.fontSize).toBe(150);
  });

  it('merges defaults, initialize, front matter and directives in that order', () => {
    const { config } = resolve({
      pluginDefaults: flowchartDefaults,
      initialize: { fontSize: 10, wrap: false, flowchart: { nodeSpacing: 60 } },
      frontMatter: { fontSize: 11, flowchart: { rankSpacing: 70 } },
      directives: [{ fontSize: 12, flowchart: { curve: 'linear' } }, { fontSize: 13 }],
    });
    expect(config.fontSize).toBe(13);
    expect(config.wrap).toBe(false);
    expect(config.flowchart).toEqual({
      nodeSpacing: 60,
      rankSpacing: 70,
      curve: 'linear',
      theme: 'redux-color',
    });
  });

  it('keeps deep options that a partial override does not mention', () => {
    const { config } = resolve({
      pluginDefaults: flowchartDefaults,
      directives: [{ flowchart: { nodeSpacing: 75 } }],
    });
    expect(config.flowchart?.nodeSpacing).toBe(75);
    expect(config.flowchart?.rankSpacing).toBe(50);
  });

  it('combines nested initialize config and several directives (v12 getUserDefinedConfig)', () => {
    const { config } = resolve({
      initialize: { flowchart: { nodeSpacing: 50, rankSpacing: 100, curve: 'linear' } },
      directives: [
        { flowchart: { nodeSpacing: 75 }, fontSize: 12 },
        { flowchart: { curve: 'basis', nodeSpacing: 100 }, mindmap: { padding: 15 } },
      ],
    });
    expect(config.flowchart).toEqual({ nodeSpacing: 100, rankSpacing: 100, curve: 'basis' });
    expect(config.fontSize).toBe(12);
    expect(config.mindmap).toEqual({ padding: 15 });
  });

  it('does not let an undefined value override a set one', () => {
    const { config } = resolve({
      initialize: { layout: undefined },
      directives: [{ fontFamily: undefined }],
    });
    expect(config.layout).toBe('layered');
    expect(config.fontFamily).toBe(CORE_DEFAULTS.fontFamily);
  });

  it('copies a fontFamily set in diagram text into themeVariables, as v12 directives did', () => {
    const { config } = resolve({ frontMatter: { fontFamily: 'Courier' } });
    expect(config.themeVariables).toEqual({ fontFamily: 'Courier' });
  });
});

describe('v12 layout names', () => {
  it('accepts layout: dagre and elk from diagram text unchanged and without warnings', () => {
    for (const layout of ['dagre', 'elk']) {
      const { config, warnings } = resolve({ frontMatter: { layout } });
      expect(config.layout).toBe(layout);
      expect(warnings).toEqual([]);
    }
  });
});

describe('diagram-scoped theme and layout', () => {
  it('a diagram default beats the global default', () => {
    const { config } = resolve({ pluginDefaults: flowchartDefaults });
    expect(config.theme).toBe('redux-color');
  });

  it('a user setting at any layer beats the diagram default', () => {
    const { config } = resolve({
      pluginDefaults: flowchartDefaults,
      initialize: { theme: 'dark' },
    });
    expect(config.theme).toBe('dark');
  });

  it('a diagram-scoped value beats the global one within a layer', () => {
    const { config } = resolve({
      pluginDefaults: flowchartDefaults,
      frontMatter: { theme: 'dark', flowchart: { theme: 'forest' } },
    });
    expect(config.theme).toBe('forest');
  });
});

describe('look is removed (D153)', () => {
  const lookWarnings = (warnings: ConfigWarning[]) =>
    warnings.filter((w) => w.code === 'LOOK_REMOVED');

  it.each(['neo', 'handDrawn', 'classic', 'sketchy'])(
    'ignores front matter `look: %s` with one LOOK_REMOVED warning',
    (look) => {
      const { config, warnings } = resolve({
        pluginDefaults: flowchartDefaults,
        frontMatter: { look },
      });
      expect(config).not.toHaveProperty('look');
      expect(config.flowchart).not.toHaveProperty('look');
      expect(codes(warnings)).toEqual(['LOOK_REMOVED look']);
    }
  );

  it('warns once however many sources and sections set it', () => {
    const { config, warnings } = resolve({
      pluginDefaults: flowchartDefaults,
      initialize: { look: 'neo', class: { look: 'neo' } },
      frontMatter: { look: 'classic', flowchart: { look: 'handDrawn' } },
      directives: [{ look: 'neo' }, { flowchart: { look: 'classic' } }],
    });
    expect(lookWarnings(warnings)).toHaveLength(1);
    expect(warnings.map((w) => w.code)).not.toContain('CONFIG_UNKNOWN_KEY');
    expect(config).not.toHaveProperty('look');
    expect(config.flowchart).not.toHaveProperty('look');
    expect(config.class).not.toHaveProperty('look');
  });

  it('a section-only look still warns, naming its path', () => {
    const { warnings } = resolve({ frontMatter: { flowchart: { look: 'neo' } } });
    expect(codes(warnings)).toEqual(['LOOK_REMOVED flowchart.look']);
  });

  it('initialize({ look }) warns with source initialize', () => {
    const { warnings } = resolve({ initialize: { look: 'neo' } });
    expect(lookWarnings(warnings).map((w) => w.source)).toEqual(['initialize']);
  });

  it('a look carried by plugin defaults is dropped silently', () => {
    const { config, warnings } = resolve({
      pluginDefaults: { flowchart: { ...flowchartDefaults.flowchart, look: 'neo' } },
    });
    expect(config.flowchart).not.toHaveProperty('look');
    expect(warnings).toEqual([]);
  });
});

describe('secure and integrator-only keys', () => {
  it('ignores secure keys in directives (v12 secure-keys spec)', () => {
    const { config, warnings } = resolve({
      initialize: {
        fontFamily: 'foo-font',
        securityLevel: 'strict',
        fontSize: 12345,
        secure: ['fontSize'],
      },
      directives: [{ fontFamily: 'baf', fontSize: 54321, securityLevel: 'loose' }],
    });
    expect(config.fontFamily).toBe('baf');
    expect(config.fontSize).toBe(12345);
    expect(config.securityLevel).toBe('strict');
    expect(codes(warnings)).toEqual([
      'CONFIG_SECURE_KEY fontSize',
      'CONFIG_SECURE_KEY securityLevel',
    ]);
  });

  it('extending secure in initialize keeps the default secure keys', () => {
    const { config } = resolve({
      initialize: { secure: ['fontSize'] },
      frontMatter: { securityLevel: 'loose', maxTextSize: 1e9 },
    });
    expect(config.securityLevel).toBe('default');
    expect(config.maxTextSize).toBe(50000);
    expect(config.secure).toContain('securityLevel');
    expect(config.secure).toContain('fontSize');
  });

  it('front matter cannot change integrator-only options, even with secure emptied', () => {
    const frontMatter = {
      secure: [],
      securityLevel: 'loose',
      maxTextSize: 1e9,
      maxEdges: 1e9,
      deterministic: false,
      idPrefix: 'evil',
      output: { cssVariables: false },
      limits: { maxNodes: 1e9 },
      linkSchemes: ['javascript'],
    };
    const { config, warnings } = resolve({
      initialize: { secure: [] },
      frontMatter,
      directives: [frontMatter],
    });
    expect(config.securityLevel).toBe('default');
    expect(config.maxTextSize).toBe(50000);
    expect(config.maxEdges).toBe(5000);
    expect(config.secure).toEqual(CORE_DEFAULTS.secure);
    for (const key of ['deterministic', 'idPrefix', 'output', 'limits', 'linkSchemes']) {
      expect(config).not.toHaveProperty(key);
    }
    expect(warnings.every((w) => w.code === 'CONFIG_SECURE_KEY')).toBe(true);
    expect(warnings).toHaveLength(2 * Object.keys(frontMatter).length);
  });

  it('the integrator can still set them through initialize', () => {
    const { config, warnings } = resolve({ initialize: { securityLevel: 'loose', maxEdges: 9 } });
    expect(config.securityLevel).toBe('loose');
    expect(config.maxEdges).toBe(9);
    expect(warnings).toEqual([]);
  });
});

describe('unknown, removed and not-yet-ported keys (R-CONF-2, R-CONF-5)', () => {
  it('warns about unknown keys in diagram text and drops them, without throwing', () => {
    const { config, warnings } = resolve({
      pluginDefaults: flowchartDefaults,
      frontMatter: { bogus: 1, flowchart: { nodeSpacing: 5, bogus: 2 } },
    });
    expect(codes(warnings)).toEqual([
      'CONFIG_UNKNOWN_KEY bogus',
      'CONFIG_UNKNOWN_KEY flowchart.bogus',
    ]);
    expect(warnings[0]).toMatchObject({ source: 'frontMatter' });
    expect(config).not.toHaveProperty('bogus');
    expect(config.flowchart).not.toHaveProperty('bogus');
    expect(config.flowchart?.nodeSpacing).toBe(5);
  });

  it('warns about unknown keys passed to initialize but keeps them', () => {
    const { config, warnings } = resolve({ initialize: { custom: 1 } as MermaidConfig });
    expect(codes(warnings)).toEqual(['CONFIG_UNKNOWN_KEY custom']);
    expect(config).toHaveProperty('custom', 1);
  });

  it('warns about removed keys from every source and drops them', () => {
    const { config, warnings } = resolve({
      initialize: { htmlLabels: false } as MermaidConfig,
      frontMatter: { flowchart: { htmlLabels: true } },
      directives: [{ dompurifyConfig: { ADD_TAGS: ['x'] } }],
    });
    expect(codes(warnings)).toEqual([
      'CONFIG_REMOVED_KEY htmlLabels',
      'CONFIG_REMOVED_KEY flowchart.htmlLabels',
      'CONFIG_REMOVED_KEY dompurifyConfig',
    ]);
    expect(warnings[0]?.message).toMatch(/htmlLabels.*removed.*SVG text/);
    expect(config).not.toHaveProperty('htmlLabels');
    expect(config).not.toHaveProperty('dompurifyConfig');
    expect(config.flowchart ?? {}).not.toHaveProperty('htmlLabels');
  });

  it('accepts keys of diagram types that are not ported yet, silently', () => {
    const { config, warnings } = resolve({
      frontMatter: { sequence: { mirrorActors: false }, gantt: { barHeight: 30 } },
      directives: [{ 'wardley-beta': { showGrid: true }, themeVariables: { pie1: '#ff0000' } }],
    });
    expect(warnings).toEqual([]);
    expect(config.sequence?.mirrorActors).toBe(false);
    expect(config.gantt?.barHeight).toBe(30);
    expect(config.themeVariables).toEqual({ pie1: '#ff0000' });
  });

  it("accepts a third-party plugin's own section", () => {
    const { config, warnings } = resolve({
      pluginDefaults: { zenuml: { width: 1 } } as MermaidConfig,
      frontMatter: { zenuml: { width: 2 } },
    });
    expect(warnings).toEqual([]);
    expect(config).toHaveProperty('zenuml', { width: 2 });
  });
});

describe('diagram text is sanitised as in v12', () => {
  it('skips prototype-pollution keys', () => {
    const frontMatter = JSON.parse(
      '{"__proto__": {"polluted": 1}, "flowchart": {"__proto__": {"polluted": 2}, "constructor": {"prototype": {"polluted": 3}}}, "themeVariables": {"__proto__": {"polluted": 4}}}'
    ) as ConfigInput;
    const { config } = resolve({ frontMatter, initialize: frontMatter as MermaidConfig });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
    expect(Object.hasOwn(config, '__proto__')).toBe(false);
    expect(Object.hasOwn(config.flowchart ?? {}, 'constructor')).toBe(false);
    expect(Object.hasOwn(config.themeVariables as object, '__proto__')).toBe(false);
  });

  it('drops markup and data URLs in string values', () => {
    const { config, warnings } = resolve({
      frontMatter: {
        fontFamily: '<script>alert(1)</script>',
        themeCSS: '.x { background: url(data:image/svg+xml;base64,AAA) }',
      },
    });
    expect(config.fontFamily).toBe(CORE_DEFAULTS.fontFamily);
    expect(config).not.toHaveProperty('themeCSS');
    expect(codes(warnings)).toEqual([
      'CONFIG_UNSAFE_VALUE fontFamily',
      'CONFIG_UNSAFE_VALUE themeCSS',
    ]);
  });

  it('blanks theme variables outside the v12 character set', () => {
    const { config } = resolve({
      directives: [{ themeVariables: { primaryColor: '#fff', lineColor: 'red; x: url(evil)' } }],
    });
    expect(config.themeVariables).toEqual({ primaryColor: '#fff', lineColor: '' });
  });

  it('replaces unbalanced CSS in font families', () => {
    const { config } = resolve({ frontMatter: { fontFamily: 'a } b {' } });
    expect(config.fontFamily).toBe('{ /* ERROR: Unbalanced CSS */ }');
  });
});

describe('the resolved config is frozen (R-ARCH-5)', () => {
  it('throws on mutation at any depth', () => {
    const { config } = resolve({ pluginDefaults: flowchartDefaults });
    const loose = config as unknown as {
      theme: string;
      added?: number;
      flowchart: { nodeSpacing: number };
      secure: string[];
    };
    expect(() => {
      loose.theme = 'dark';
    }).toThrow(TypeError);
    expect(() => {
      loose.flowchart.nodeSpacing = 1;
    }).toThrow(TypeError);
    expect(() => loose.secure.push('x')).toThrow(TypeError);
    expect(() => {
      loose.added = 1;
    }).toThrow(TypeError);
  });

  it('does not share or modify its inputs', () => {
    const initialize: MermaidConfig = { flowchart: { nodeSpacing: 1 } };
    const directive = { fontFamily: 'Courier', flowchart: { rankSpacing: 2 } };
    const { config } = resolve({ initialize, directives: [directive] });
    expect(initialize).toEqual({ flowchart: { nodeSpacing: 1 } });
    expect(directive).toEqual({ fontFamily: 'Courier', flowchart: { rankSpacing: 2 } });
    expect(Object.isFrozen(initialize)).toBe(false);
    expect(config.flowchart).toEqual({ nodeSpacing: 1, rankSpacing: 2 });
  });

  it('the exported defaults are frozen too', () => {
    expect(Object.isFrozen(CORE_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(CORE_DEFAULTS.secure)).toBe(true);
  });
});

describe('CORE_DEFAULTS', () => {
  it('are the v12.2.0 top-level defaults, with redux, layered, securityLevel default (D75) and 5,000 edges (D31) as the new defaults', () => {
    // Read from mermaid@12.2.0's `mermaidAPI.defaultConfig` (objects and functions left out).
    const v12 = {
      theme: 'default',
      look: 'classic',
      handDrawnSeed: 0,
      layout: 'elk',
      maxTextSize: 50000,
      maxEdges: 500,
      darkMode: false,
      fontFamily: '"trebuchet ms", verdana, arial, sans-serif;',
      logLevel: 5,
      securityLevel: 'strict',
      startOnLoad: true,
      arrowMarkerAbsolute: false,
      secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'suppressErrorRendering',
        'maxEdges',
      ],
      legacyMathML: false,
      forceLegacyMathML: false,
      deterministicIds: false,
      fontSize: 16,
      markdownAutoWrap: true,
      suppressErrorRendering: false,
    };
    expect(CORE_DEFAULTS).toEqual({
      ...v12,
      theme: 'redux',
      layout: 'layered',
      securityLevel: 'default',
      maxEdges: 5000,
      look: undefined, // removed, no default (D153)
    });
  });
});
