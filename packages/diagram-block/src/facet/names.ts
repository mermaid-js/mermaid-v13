/**
 * Which names each block symbol kind can take (`LanguageFacet.isValidId`, D92, D448): a name is
 * valid when, written where that kind is written, it reads back as exactly that one symbol.
 * An existing name is refused by the service's own clash check.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import { blockTokens } from '../parser/index.ts';
import { T } from '../parser/tokens.ts';

/** The symbol kinds the block parser records. */
const KINDS = ['block', 'class'] as const;
export type BlockSymbolKind = (typeof KINDS)[number];

const isKind = (kind: string): kind is BlockSymbolKind =>
  (KINDS as readonly string[]).includes(kind);

/** What the id rule (`[^\(\[\n\-\)\{\}\s\<\>:=]+`) does not take. */
const NOT_ID = /[([\-){}\s<>:=]/u;
/** `CLASSDEF_ID`'s `\w+`. */
const CLASS_NAME = /^\w+$/;

/**
 * Whether `name` lexes as exactly one block id written alone on a line, before a shape and at
 * both ends of a link (`class` and `style`, for one, are ids only before a `[`).
 */
function readsAsId(name: string): boolean {
  const lines = [`${name}`, `${name}["x"]`, `${name} --> ${name}`];
  const text = `block\n${lines.map((l) => `  ${l}\n`).join('')}`;
  const tokens = blockTokens(text);
  const ids = tokens.filter((t) => t.kind === T.NodeId);
  return (
    ids.length === 4 &&
    ids.every((t) => t.text === name && t.range.end - t.range.start === name.length) &&
    tokens.every((t) => t.kind !== Kind.Error)
  );
}

function classReason(name: string): string | undefined {
  if (name === '') return 'A class name cannot be empty.';
  if (!CLASS_NAME.test(name))
    return 'A class name takes letters, digits and `_` only, as `classDef` reads it.';
  if (name === 'DEFAULT') return '`DEFAULT` is not a class name a block diagram takes.';
  return undefined;
}

function blockReason(name: string): string | undefined {
  if (name === '') return 'A block id cannot be empty.';
  if (NOT_ID.test(name))
    return 'A block id cannot hold blanks, line breaks or any of `(`, `)`, `[`, `{`, `}`, `<`, `>`, `-`, `:` and `=`.';
  return readsAsId(name) ? undefined : `'${name}' would not read as a block id.`;
}

/** Why `name` cannot be a `kind` name (a block id when omitted), if it cannot. */
export function invalidReason(name: string, kind = 'block'): string | undefined {
  if (!isKind(kind)) return `'${kind}' is not a block symbol kind.`;
  return kind === 'class' ? classReason(name) : blockReason(name);
}
