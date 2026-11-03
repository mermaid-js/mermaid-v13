/** Where the dev server listens: v12's port rule and the addresses it prints on startup. */
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NetworkInterfaceInfo } from 'node:os';
import { basename } from 'node:path';

/**
 * v12's rule (fa796a943 `.esbuild/server.ts:26-41`), so parallel checkouts don't collide:
 * `MERMAID_DEV_PORT` overrides; a checkout named `alana-mermaid` gets 9000; any other gets
 * 9000 + sha1(root) % 100. An invalid override is ignored. `root` is the checkout root.
 */
export function resolveDevPort(env: NodeJS.ProcessEnv, root: string): number {
  const override = env.MERMAID_DEV_PORT;
  if (override) {
    const parsed = Number.parseInt(override, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  if (basename(root) === 'alana-mermaid') return 9000;
  const hash = createHash('sha1').update(root).digest();
  return 9000 + (hash.readUInt16BE(0) % 100);
}

type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

const WILDCARD_FAMILIES: ReadonlyMap<string, string[]> = new Map([
  ['::', ['IPv4', 'IPv6']],
  ['0.0.0.0', ['IPv4']],
]);

const urlOf = (address: string, family: string, port: number): string =>
  `http://${family === 'IPv6' ? `[${address}]` : address}:${port}/`;

/**
 * The URLs a server bound to `bound` answers on: every interface address (of both families
 * for `::`, IPv4 only for `0.0.0.0`) once each, or the one bound address. Pass `os.networkInterfaces()`.
 */
export function listenUrls(
  bound: Pick<AddressInfo, 'address' | 'family' | 'port'>,
  interfaces: Interfaces
): string[] {
  const families = WILDCARD_FAMILIES.get(bound.address) ?? [];
  if (families.length === 0) return [urlOf(bound.address, bound.family, bound.port)];
  const urls = Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((nic) => families.includes(nic.family))
    .map((nic) => urlOf(nic.address, nic.family, bound.port));
  // Two interfaces can share a link-local address; list it once.
  return [...new Set(urls)];
}
