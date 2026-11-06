/**
 * Preprocess (DESIGN §4.1, D67): locate front matter and `%%{…}%%` directives without
 * rewriting the source. Everything returned is a range into the original text.
 */
export { preprocess } from './preprocess.ts';
export type { PreprocessResult } from './preprocess.ts';
export { diagramStart } from './diagram-start.ts';
export type { FrontMatter } from './frontmatter.ts';
export { MAX_DIRECTIVE_DEPTH } from './directives.ts';
export type { Directive, DirectiveKind } from './directives.ts';
export { isYamlMap, MAX_YAML_DEPTH, parseYaml } from './yaml.ts';
export { flatYamlMap } from './yaml-flat.ts';
export type { YamlMap, YamlOptions, YamlResult, YamlValue } from './yaml.ts';
export type { YamlTreeOptions, YamlTreeResult } from './yaml.ts';
export type {
  YamlMapNode,
  YamlNode,
  YamlPair,
  YamlScalarNode,
  YamlScalarStyle,
  YamlSeqNode,
} from './yaml-nodes.ts';
