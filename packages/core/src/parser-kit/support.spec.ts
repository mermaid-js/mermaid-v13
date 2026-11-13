import { describe, expect, it } from 'vitest';
import { ID_CONTROL, ID_RESERVED, idEscaper } from './support.ts';
import { Stop, STOP } from './stop.ts';

describe('STOP', () => {
  it('is one Stop instance', () => {
    expect(STOP).toBeInstanceOf(Stop);
    expect(STOP).toBeInstanceOf(Error);
  });
});

describe('idEscaper', () => {
  it('escapes the id grammar characters by default', () => {
    expect(idEscaper()('a%b>c@d#e f')).toBe('a%25b%3Ec%40d%23e f');
    expect(idEscaper(ID_RESERVED)('plain')).toBe('plain');
  });

  it('escapes a passed set, with four digits from U+0080 on', () => {
    const esc = idEscaper(ID_RESERVED + ID_CONTROL);
    expect(esc('a\u0001b')).toBe('a%01b');
    expect(esc('￾')).toBe('%FFFE');
    expect(esc('\ud800')).toBe('%D800');
  });
});
