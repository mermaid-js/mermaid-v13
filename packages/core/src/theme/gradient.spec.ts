import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, THEME_NAMES, type ThemeWarning } from './index.ts';

const reduxColor = await loadTheme('redux-color');
const base = await loadTheme('base');

describe('theme.outline (D182)', () => {
  it('is the colour while useGradient is off, as in every shipped theme but the neo ones', async () => {
    for (const name of THEME_NAMES.filter((n) => !n.startsWith('neo'))) {
      const t = createTheme(await loadTheme(name));
      expect(t.value('useGradient')).toBe('false');
      expect(t.outline('nodeBorder')).toBe(t.color('nodeBorder'));
      expect(t.gradient()).toBeUndefined();
    }
  });

  it('is on in neo and neo-dark, as v12 has it (D182)', async () => {
    for (const name of ['neo', 'neo-dark'] as const) {
      const t = createTheme(await loadTheme(name), { idPrefix: () => 'd1' });
      expect(t.value('useGradient')).toBe('true');
      expect(t.outline('nodeBorder')).toBe('url(#d1-gradient)');
    }
  });

  it('is the render’s gradient when themeVariables turn it on', () => {
    const t = createTheme(reduxColor, {
      themeVariables: { useGradient: true },
      idPrefix: () => 'd1',
    });
    expect(t.outline('nodeBorder')).toBe('url(#d1-gradient)');
    expect(t.gradient()).toEqual({
      id: 'd1-gradient',
      start: 'var(--mermaid-gradientStart,#0042eb)',
      stop: 'var(--mermaid-gradientStop,#eb0042)',
    });
  });

  it('accepts the flag as a string, and "false" turns it off', () => {
    const on = createTheme(reduxColor, { themeVariables: { useGradient: 'true' } });
    expect(on.outline('nodeBorder')).toBe('url(#mermaid-gradient)');
    const off = createTheme(reduxColor, { themeVariables: { useGradient: 'false' } });
    expect(off.gradient()).toBeUndefined();
  });

  it('drops a flag that is not a boolean, with a warning', () => {
    const warnings: ThemeWarning[] = [];
    const t = createTheme(reduxColor, {
      themeVariables: { useGradient: 'yes' },
      warn: (w) => warnings.push(w),
    });
    expect(t.gradient()).toBeUndefined();
    expect(warnings.map((w) => w.code)).toEqual(['THEME_VARIABLE_DROPPED']);
  });

  it('writes literal stop colours with cssVariables: false', () => {
    const t = createTheme(reduxColor, {
      themeVariables: { useGradient: true, gradientStart: '#112233' },
      cssVariables: false,
    });
    expect(t.gradient()).toMatchObject({ start: '#112233', stop: '#eb0042' });
  });

  it('derives the classic stops from the border colours, as v12 theme-base does', () => {
    const t = createTheme(base, { themeVariables: { useGradient: true }, cssVariables: false });
    expect(t.gradient()).toMatchObject({
      start: t.value('primaryBorderColor'),
      stop: t.value('secondaryBorderColor'),
    });
  });

  it('turns an id prefix that is not an XML name into one', () => {
    const t = createTheme(reduxColor, {
      themeVariables: { useGradient: true },
      idPrefix: () => ':r1: x',
    });
    expect(t.gradient()!.id).toMatch(/^p-[a-z0-9]+-gradient$/);
    expect(t.outline('nodeBorder')).toBe(`url(#${t.gradient()!.id})`);
  });

  it('reads the id prefix only when the gradient is on', () => {
    let reads = 0;
    const t = createTheme(reduxColor, { idPrefix: () => (reads++, 'x') });
    t.outline('nodeBorder');
    t.gradient();
    expect(reads).toBe(0);
  });
});
