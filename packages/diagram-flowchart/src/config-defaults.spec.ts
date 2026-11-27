import { describe, expect, it } from 'vitest';
import { DEFAULT_CURVE } from '@mermaid-js/shared/svg/route';
import { flowchartConfigDefaults } from './index.ts';
import { FLOWCHART_CURVE } from './render/curve.ts';

describe('flowchartConfigDefaults', () => {
  it('are the v12 flowchart section defaults without htmlLabels', () => {
    // mermaid@12.2.0 `mermaidAPI.defaultConfig.flowchart`, minus the removed `htmlLabels`,
    // plus `stepDuration`/`stepNumbers`, which the v12 schema at the v13 branch point adds;
    // `look` is removed (D153). `curve` has no schema default: its default is in code (D733).
    expect(flowchartConfigDefaults).toEqual({
      useMaxWidth: true,
      theme: 'redux-color',
      titleTopMargin: 25,
      subGraphTitleMargin: { top: 0, bottom: 0 },
      diagramPadding: 8,
      nodeSpacing: 50,
      rankSpacing: 50,
      padding: 15,
      wrappingWidth: 120,
      minNodeWidth: 120,
      stepDuration: 1,
      stepNumbers: false,
      inheritDir: false,
    });
  });

  it("leave curve to code: rounded (v12 basis), the look of v12's default ELK layout (D733)", () => {
    expect(flowchartConfigDefaults).not.toHaveProperty('curve');
    expect(FLOWCHART_CURVE).toBe('rounded');
  });

  it('name the curve an unknown curve name falls back to: flowchart default (D681)', () => {
    expect(DEFAULT_CURVE).toBe(FLOWCHART_CURVE);
  });
});
