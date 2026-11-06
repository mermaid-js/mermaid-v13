// `RenderContext.icon` (D293) over the extensions' glyph providers: a placeholder (`'pending'`)
// and a name no extension has (`undefined`) are told apart for a caller that asks (M4 follow-up).
import { describe, expect, it } from 'vitest';
import type { Paint } from '../svg/types.ts';
import type { SvgFragment } from '../text/index.ts';
import { HookRunner, type GlyphProvider } from './extensions.ts';

const GLYPH: SvgFragment = { tag: 'rect', attrs: { width: 8, height: 8 } };

function lookup(...answers: ReturnType<GlyphProvider['glyph']>[]) {
  const hooks = new HookRunner();
  answers.forEach((answer, i) =>
    hooks.register({ id: `g${String(i)}`, glyphs: { glyph: () => answer } })
  );
  const icon = hooks.icon({ warn: () => {}, scratch: {} });
  if (!icon) throw new Error('no glyphs');
  return icon;
}

describe('RenderContext.icon (D293)', () => {
  it('gives undefined for a placeholder unless asked to tell it apart', () => {
    expect(lookup('pending')('fa:bell', 8)).toBeUndefined();
    expect(lookup('pending')('fa:bell', 8, { pending: true })).toBe('pending');
  });

  it('gives undefined when no extension has the glyph, asked or not', () => {
    expect(lookup(undefined)('fa:bell', 8)).toBeUndefined();
    expect(lookup(undefined)('fa:bell', 8, { pending: true })).toBeUndefined();
  });

  it('takes the first glyph, then null, then a placeholder', () => {
    expect(lookup('pending', GLYPH)('fa:bell', 8, { pending: true })).toBe(GLYPH);
    expect(lookup('pending', null)('fa:bell', 8, { pending: true })).toBeNull();
    expect(lookup('pending', null)('fa:bell', 8)).toBeNull();
    expect(lookup(undefined, 'pending')('fa:bell', 8, { pending: true })).toBe('pending');
  });

  it('does not hand the pending option to the providers', () => {
    const seen: object[] = [];
    const hooks = new HookRunner();
    hooks.register({ id: 'g', glyphs: { glyph: (_, request) => (seen.push(request), GLYPH) } });
    hooks.icon({ warn: () => {}, scratch: {} })!('fa:bell', 8, {
      pending: true,
      paint: 'none' as Paint,
    });
    expect(seen[0]).not.toHaveProperty('pending');
    expect(seen[0]).toMatchObject({ size: 8, paint: 'none' });
  });
});
