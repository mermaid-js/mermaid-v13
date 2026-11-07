// Test helper: draws a packet diagram as text through the `./ascii` entry, as the pipeline
// hands it over: the parse's model and AST, and the resolved config with the generated `packet`
// defaults and the `ascii` section. The hook draws from the model alone, so no layout is made.
import type { Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ascii, type PacketAsciiContext } from '../ascii.ts';
import { packetConfigDefaults } from '../generated/config-defaults.ts';
import { parsePacket } from '../parser/index.ts';

export interface DrawOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  maxWidth?: number;
  /** The site's `packet` section, under the source's own. */
  packet?: Record<string, unknown>;
}

export interface Drawn {
  text: string;
  warnings: Warning[];
}

/** `src` as text, with the warnings the hook gave. */
export function draw(src: string, options: DrawOptions = {}): Drawn {
  const pre = preprocess(src);
  const { packet, ...section } = options;
  const directives = pre.directives.flatMap((d) => (d.kind === 'init' ? [d.args] : []));
  const resolved = resolveConfig(
    CORE_DEFAULTS,
    (packet ? { packet } : {}) as never,
    pre.frontMatter?.config as never,
    directives as never,
    { packet: packetConfigDefaults } as never
  );
  const config = {
    ...resolved,
    ascii: { ...(resolved as { ascii?: object }).ascii, ...section },
  } as unknown as ResolvedConfig;
  const parse = parsePacket(src, { preprocessed: pre, config: config.packet });
  const warnings: Warning[] = [];
  const ctx: PacketAsciiContext = {
    config,
    warn: (w) => void warnings.push(w),
    ast: parse.ast,
  };
  return { text: ascii(parse.model, undefined, ctx), warnings };
}

/** Draws and returns the text alone. */
export const text = (src: string, options?: DrawOptions): string => draw(src, options).text;
