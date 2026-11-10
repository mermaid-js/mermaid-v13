import { describe, expect, it } from 'vitest';
import { ishikawaLayoutConfig, ishikawaUseMaxWidth, ISHIKAWA_CONFIG_DEFAULTS } from './config.ts';
import { ishikawaConfigDefaults } from './generated/config-defaults.ts';
import { ishikawa } from './plugin.ts';

/**
 * The `ishikawa` defaults have one source, the generated section defaults (`gen:config`, #585):
 * the fallbacks the layout and the renderer use are those, and the plugin hands core the same.
 */
describe('ishikawa config defaults', () => {
  it('are the generated section defaults, with every key the fallbacks read set', () => {
    expect(ISHIKAWA_CONFIG_DEFAULTS).toBe(ishikawaConfigDefaults);
    expect(ishikawa.configDefaults).toBe(ishikawaConfigDefaults);
    expect(typeof ishikawaConfigDefaults.diagramPadding).toBe('number');
    expect(typeof ishikawaConfigDefaults.useMaxWidth).toBe('boolean');
  });

  it("fall back to the generated defaults for a value that can't be used", () => {
    const { diagramPadding, useMaxWidth } = ishikawaConfigDefaults;
    expect(ishikawaLayoutConfig(undefined).diagramPadding).toBe(diagramPadding);
    expect(ishikawaLayoutConfig({ diagramPadding: 'wide' }).diagramPadding).toBe(diagramPadding);
    expect(ishikawaLayoutConfig({ diagramPadding: -1 }).diagramPadding).toBe(diagramPadding);
    expect(ishikawaUseMaxWidth(undefined)).toBe(useMaxWidth);
    expect(ishikawaUseMaxWidth({ useMaxWidth: 'no' })).toBe(useMaxWidth);
  });

  it("keep an author's value", () => {
    expect(ishikawaLayoutConfig({ diagramPadding: 50 }).diagramPadding).toBe(50);
    expect(ishikawaLayoutConfig({ diagramPadding: '0' }).diagramPadding).toBe(0);
    expect(ishikawaUseMaxWidth({ useMaxWidth: false })).toBe(false);
    expect(ishikawaUseMaxWidth({ useMaxWidth: true })).toBe(true);
  });
});
