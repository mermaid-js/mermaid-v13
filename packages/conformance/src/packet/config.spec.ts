/**
 * #462: the `packet` config section against v12 12.2.0's `packetDb.getConfig()`
 * (`cleanAndMerge({...DEFAULT_PACKET_CONFIG, ...getConfig().packet})`): the plugin's generated
 * defaults, and the section a render hands the layout, equal what v12's DB returns for the same
 * site config, less `useWidth` (ignored: only v12's gantt read it). v12's `getConfig()` adds the
 * bit numbers' 10 px to `paddingY` when `showBits` is on (`db.ts:49-51`); v13's config keeps the
 * author's value and the layout adds the 10 px (`PacketLayout.paddingY`), so the v12 side takes
 * them off again. Out-of-range values are D342's and are gated by the parser and layout specs.
 */
import { packet, PACKET_CONFIG_DEFAULTS } from '@mermaid-js/diagram-packet';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getDiagramFromText(text: string): Promise<{ db: { getConfig(): object } }>;
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

const BODY = 'packet\n  0-15: "a"\n';

/** v12's DB config for `BODY` with `config` initialised, without `useWidth`. */
async function v12Config(config: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(config);
  try {
    const { useWidth: _ignored, ...rest } = (
      await v12.mermaidAPI.getDiagramFromText(BODY)
    ).db.getConfig() as Record<string, unknown>;
    return rest.showBits ? { ...rest, paddingY: Number(rest.paddingY) - 10 } : rest;
  } finally {
    v12.mermaidAPI.reset();
  }
}

/** The `packet` section v13's layout is handed under `site` config. */
async function v13Config(site: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> | undefined;
  const spy = {
    ...packet,
    layout: (...args: Parameters<typeof packet.layout>) => {
      seen = { ...(args[1].config.packet as Record<string, unknown>) };
      return packet.layout(...args);
    },
  };
  const m = createMermaid();
  m.initialize({ deterministic: true, ...site });
  await m.registerExternalDiagrams([spy], { lazyLoad: false, replace: true });
  await m.render('cfg', BODY);
  if (!seen) throw new Error('the layout was not called');
  return seen;
}

const keysOf = (old: object, now: Record<string, unknown>): object =>
  Object.fromEntries(Object.keys(old).map((k) => [k, now[k]]));

describe('packet config against v12 12.2.0 (#462)', () => {
  it('the plugin’s generated defaults are v12’s, less useWidth', async () => {
    expect(packet.configDefaults).toEqual(await v12Config());
  });

  it('the parser and layout fall back to the same defaults (D342)', () => {
    const { useMaxWidth: _svgOnly, ...lengths } = packet.configDefaults;
    expect(PACKET_CONFIG_DEFAULTS).toEqual(lengths);
  });

  it('a site packet config reaches the layout as v12’s DB has it', async () => {
    const site = {
      packet: { rowHeight: 20, bitWidth: 16, bitsPerRow: 16, showBits: false, paddingX: 2 },
    };
    const old = await v12Config(site);
    expect(keysOf(old, await v13Config(site))).toEqual(old);
  });

  it('bitOrder descending reaches the layout', async () => {
    const site = { packet: { bitOrder: 'descending', useMaxWidth: false } };
    const old = await v12Config(site);
    expect(keysOf(old, await v13Config(site))).toEqual(old);
  });
});
