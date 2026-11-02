import { describe, expect, it } from 'vitest';
import { flowchartConfigDefaults } from './index.ts';

describe('flowchartConfigDefaults', () => {
  it('are the v12 flowchart section defaults without htmlLabels', () => {
    // mermaid@12.2.0 `mermaidAPI.defaultConfig.flowchart`, minus the removed `htmlLabels`,
    // plus `stepDuration`/`stepNumbers`, which the v12 schema at the v13 branch point adds,
    // and `curve: rounded` (v12 `basis`), the look of v12's default ELK layout.
    expect(flowchartConfigDefaults).toEqual({
      useMaxWidth: true,
      theme: 'redux-color',
      look: 'neo',
      titleTopMargin: 25,
      subGraphTitleMargin: { top: 0, bottom: 0 },
      diagramPadding: 8,
      nodeSpacing: 50,
      rankSpacing: 50,
      curve: 'rounded',
      padding: 15,
      wrappingWidth: 120,
      minNodeWidth: 120,
      stepDuration: 1,
      stepNumbers: false,
      inheritDir: false,
    });
  });
});
