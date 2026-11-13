/**
 * The c4-beta corpus: the probes of spec #730, and the grammar's sample and agreement documents,
 * each with generated variants (CRLF, comment lines, a directive) that must read the same.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';

export const CASES_DIR = join(import.meta.dirname, 'cases');
const GRAMMAR_DIR = join(REPO_ROOT, 'packages/diagram-c4/grammar');

export interface C4BetaSource {
  id: string;
  source: string;
}

/** The probes and the grammar's two documents, as written. */
export function c4betaSources(): C4BetaSource[] {
  const cases = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => ({ id: f, source: readFileSync(join(CASES_DIR, f), 'utf8') }));
  const docs = ['c4beta.sample.mmd', 'c4beta.agree.mmd'].map((f) => ({
    id: f,
    source: readFileSync(join(GRAMMAR_DIR, f), 'utf8'),
  }));
  return [...cases, ...docs];
}

/** A comment line before every line. */
const commented = (src: string): string => src.replace(/^/gm, '%% c\n');
/** Every line break a CRLF. */
const crlf = (src: string): string => src.replace(/\n/g, '\r\n');
/** A directive after the first line, and front matter before the header. */
const directive = (src: string): string => src.replace('\n', '\n%%{init: {}}%%\n');
const frontMatter = (src: string): string => `---\ntitle: Front\n---\n${src}`;

/** Each source and its variants. */
export function c4betaCorpus(): C4BetaSource[] {
  return c4betaSources().flatMap(({ id, source }) => [
    { id, source },
    { id: `${id} (CRLF)`, source: crlf(source) },
    { id: `${id} (directive)`, source: directive(source) },
    { id: `${id} (front matter)`, source: frontMatter(source) },
    { id: `${id} (comment lines)`, source: commented(source) },
  ]);
}
