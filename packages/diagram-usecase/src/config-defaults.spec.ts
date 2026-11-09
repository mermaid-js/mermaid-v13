import { describe, expect, it } from 'vitest';
import { USECASE_CONFIG_DEFAULTS, usecaseLayoutConfig } from './config.ts';
import { usecaseConfigDefaults } from './generated/config-defaults.ts';
import { usecase } from './plugin.ts';

describe('usecase config defaults (#567)', () => {
  it('are the generated section defaults, which equal the layout fallbacks', () => {
    expect(usecase.configDefaults).toBe(usecaseConfigDefaults);
    const { theme, ...rest } = usecaseConfigDefaults;
    expect(theme).toBe('redux-color');
    expect(rest).toEqual(USECASE_CONFIG_DEFAULTS);
  });

  it('leave both font families out, so the theme fontFamily applies (D132)', () => {
    expect(usecaseConfigDefaults).not.toHaveProperty('actorFontFamily');
    expect(usecaseConfigDefaults).not.toHaveProperty('usecaseFontFamily');
    const config = usecaseLayoutConfig(usecase.configDefaults);
    expect(config.actorFont).not.toHaveProperty('family');
    expect(config.usecaseFont).not.toHaveProperty('family');
  });
});
