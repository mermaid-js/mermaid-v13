/**
 * The node tree of the YAML reader's tree mode (`parseYaml(src, { tree: true })`, R-LANG-5):
 * every key and value with its range into the original source.
 */
import type { Range } from '../parser-kit/positions.ts';

/** How a scalar is written in the source. */
export type YamlScalarStyle = 'plain' | 'single' | 'double' | 'literal' | 'folded';

/** A scalar. An empty value (`key:`) is a plain `null` with an empty range where it would start. */
export interface YamlScalarNode {
  kind: 'scalar';
  value: null | boolean | number | string;
  style: YamlScalarStyle;
  range: Range;
}

/** A block (`- a`) or flow (`[a]`) sequence. */
export interface YamlSeqNode {
  kind: 'seq';
  flow: boolean;
  items: YamlNode[];
  range: Range;
}

/** A block (`a: 1`) or flow (`{a: 1}`) mapping, entries in source order. */
export interface YamlMapNode {
  kind: 'map';
  flow: boolean;
  pairs: YamlPair[];
  range: Range;
}

/** One mapping entry. `value` is missing when the value could not be read. */
export interface YamlPair {
  key: string;
  keyRange: Range;
  value?: YamlNode;
}

export type YamlNode = YamlScalarNode | YamlSeqNode | YamlMapNode;
