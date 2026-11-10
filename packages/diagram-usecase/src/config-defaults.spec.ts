import { describe, expect, it } from 'vitest';
import { usecaseLayoutConfig } from './config.ts';
import { usecaseConfigDefaults } from './generated/config-defaults.ts';
import { usecase } from './plugin.ts';

describe('usecase config defaults (#567)', () => {
  it('are the generated section defaults, which the layout falls back to', () => {
    expect(usecase.configDefaults).toBe(usecaseConfigDefaults);
    expect(usecaseConfigDefaults.theme).toBe('redux-color');
    const filled = usecaseLayoutConfig(usecase.configDefaults);
    expect(usecaseLayoutConfig(undefined)).toEqual(filled);
    expect(filled).toEqual({
      wrappingWidth: 120,
      minNodeWidth: 120,
      nodeSpacing: 50,
      rankSpacing: 50,
      diagramPadding: 20,
      actorFont: { size: 14, weight: 400 },
      usecaseFont: { size: 12, weight: 400 },
      colorScheme: 'role',
      useMaxWidth: true,
      set: new Set(),
    });
  });

  it('counts a key as set when it is taken and off its default', () => {
    const config = usecaseLayoutConfig({
      ...usecaseConfigDefaults,
      diagramPadding: '20',
      nodeSpacing: '30',
      rankSpacing: 'wide',
      actorFontFamily: 'serif',
      usecaseFontWeight: 'bold',
      useMaxWidth: false,
    });
    expect([...config.set]).toEqual([
      'nodeSpacing',
      'actorFontFamily',
      'usecaseFontWeight',
      'useMaxWidth',
    ]);
  });

  it('leave both font families out, so the theme fontFamily applies (D132)', () => {
    expect(usecaseConfigDefaults).not.toHaveProperty('actorFontFamily');
    expect(usecaseConfigDefaults).not.toHaveProperty('usecaseFontFamily');
    const config = usecaseLayoutConfig(usecase.configDefaults);
    expect(config.actorFont).not.toHaveProperty('family');
    expect(config.usecaseFont).not.toHaveProperty('family');
  });
});
