import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { listenUrls, resolveDevPort } from './listen.ts';

describe('resolveDevPort (v12 .esbuild/server.ts:26-41)', () => {
  it('MERMAID_DEV_PORT overrides', () => {
    expect(resolveDevPort({ MERMAID_DEV_PORT: '9123' }, '/x/alana-mermaid')).toBe(9123);
  });

  it('ignores an invalid override', () => {
    expect(resolveDevPort({ MERMAID_DEV_PORT: 'nope' }, '/x/alana-mermaid')).toBe(9000);
    expect(resolveDevPort({ MERMAID_DEV_PORT: '70000' }, '/x/alana-mermaid')).toBe(9000);
  });

  it('a checkout named alana-mermaid gets 9000', () => {
    expect(resolveDevPort({}, '/home/someone/alana-mermaid')).toBe(9000);
  });

  it('any other checkout gets 9000 + sha1(root) % 100', () => {
    // sha1('/work/mermaid-v13') starts 0xa68e → 42638 % 100 = 38.
    expect(resolveDevPort({}, '/work/mermaid-v13')).toBe(9038);
    const port = resolveDevPort({}, '/some/other/checkout');
    expect(port).toBeGreaterThanOrEqual(9000);
    expect(port).toBeLessThan(9100);
  });
});

describe('listenUrls', () => {
  const nic = (address: string, family: 'IPv4' | 'IPv6'): NetworkInterfaceInfo =>
    ({ address, family, internal: false, netmask: '', mac: '', cidr: null }) as never;
  const interfaces = {
    lo: [nic('127.0.0.1', 'IPv4'), nic('::1', 'IPv6')],
    en0: [nic('192.0.2.10', 'IPv4'), nic('2001:db8::5', 'IPv6')],
    // Shares en0's address: listed once.
    en1: [nic('192.0.2.10', 'IPv4')],
  };

  it('lists every interface address when bound to the IPv6 wildcard', () => {
    expect(listenUrls({ address: '::', family: 'IPv6', port: 9001 }, interfaces)).toEqual([
      'http://127.0.0.1:9001/',
      'http://[::1]:9001/',
      'http://192.0.2.10:9001/',
      'http://[2001:db8::5]:9001/',
    ]);
  });

  it('lists only IPv4 addresses when bound to 0.0.0.0', () => {
    expect(listenUrls({ address: '0.0.0.0', family: 'IPv4', port: 9001 }, interfaces)).toEqual([
      'http://127.0.0.1:9001/',
      'http://192.0.2.10:9001/',
    ]);
  });

  it('lists the one address when bound to a specific host', () => {
    expect(listenUrls({ address: '127.0.0.1', family: 'IPv4', port: 9001 }, interfaces)).toEqual([
      'http://127.0.0.1:9001/',
    ]);
  });
});
