/**
 * Preprocess (DESIGN §4.1, D67, R-COMPAT-6): find the front matter and the `%%{…}%%`
 * directives and read them, without rewriting the source. There is no SourceMap: the body,
 * the front matter, the directives and every diagnostic are ranges into the original text.
 * `%%` comments, CRLF and entities are left to the lexers and label parsers.
 */
import { Diagnostics } from '../parser-kit/diagnostics.ts';
import type { Diagnostic } from '../parser-kit/diagnostics.ts';
import { scanDirectives } from './directives.ts';
import type { Directive } from './directives.ts';
import { scanFrontMatter } from './frontmatter.ts';
import type { FrontMatter } from './frontmatter.ts';

export interface PreprocessResult {
  /** Offset where the diagram text starts; detection and the diagram parser start here. */
  bodyStart: number;
  frontMatter?: FrontMatter;
  /** Every `%%{…}%%` above the front matter and in the body, in source order; they stay as trivia. */
  directives: Directive[];
  /** Errors and warnings from the front matter and the directives. */
  diagnostics: Diagnostic[];
}

/** Preprocess one diagram source. Linear in its length; never throws on any input. */
export function preprocess(src: string): PreprocessResult {
  const diagnostics = new Diagnostics();
  const { bodyStart, fenceStart, frontMatter } = scanFrontMatter(src, diagnostics);
  // Directives above the fence still apply (D705); the YAML between the fences is never read
  // for them. The head is cut off at the fence, so its ranges are offsets into `src` as well.
  const head = fenceStart > 0 ? scanDirectives(src.slice(0, fenceStart), 0, diagnostics) : [];
  const body = scanDirectives(src, bodyStart, diagnostics);
  const directives = head.length > 0 ? [...head, ...body] : body;
  const result: PreprocessResult = { bodyStart, directives, diagnostics: diagnostics.list };
  if (frontMatter) result.frontMatter = frontMatter;
  return result;
}
