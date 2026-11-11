/** Untimed P4/P11 gates. All records remain local and every fixed record is retained. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { verifyArtifacts } from './build.mjs';
import { digest, PIN_KEYS } from './evaluate.mjs';

const decode = (value) =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === '#')
      return String.fromCodePoint(
        parseInt(
          entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1),
          entity[1].toLowerCase() === 'x' ? 16 : 10
        )
      );
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity];
  });
const canonical = (values) =>
  values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function customDeclarations(css) {
  const result = [];
  const pattern = /(--mermaid-[\w-]+)\s*:\s*/g;
  let match;
  while ((match = pattern.exec(css))) {
    let quote = null;
    let depth = 0;
    let end = pattern.lastIndex;
    const start = end;
    for (; end < css.length; end++) {
      const ch = css[end];
      if (ch === '\\') {
        end++;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (depth === 0 && (ch === ';' || ch === '}')) break;
    }
    if (quote || depth !== 0) throw new Error('Unparseable protected CSS declaration');
    result.push({ name: match[1], value: css.slice(start, end).trim() });
    pattern.lastIndex = end;
  }
  return result;
}
/** Conservative XML scanner: all class tokens are protected, including user classDef classes.
 * Element association is retained, while nesting and non-public paint attributes may change. */
export function publicSurface(svg) {
  if (typeof svg !== 'string' || !/<svg[\s>]/.test(svg)) throw new Error('Missing SVG root');
  const elements = [];
  const properties = [];
  const text = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const tags = text.match(/<[A-Za-z][\w:.-]*(?:\s+[^<>]*?)?\s*\/?>/g) ?? [];
  for (const tag of tags) {
    const body = tag.replace(/^<[\w:.-]+/, '').replace(/\/?\s*>$/, '');
    const attrs = {};
    const residue = body.replace(/([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g, (_, key, value) => {
      if (Object.hasOwn(attrs, key)) throw new Error(`Duplicate SVG attribute ${key}`);
      attrs[key] = decode(value.slice(1, -1));
      return '';
    });
    if (residue.trim()) throw new Error('Unparseable SVG attributes');
    const record = {};
    if (Object.hasOwn(attrs, 'id')) record.id = attrs.id;
    if (Object.hasOwn(attrs, 'class'))
      record.classes = [...new Set(attrs.class.split(/\s+/).filter(Boolean))].sort();
    if (Object.hasOwn(attrs, 'data-ast')) record.dataAst = attrs['data-ast'];
    if (Object.keys(record).length) elements.push(record);
    if (attrs.style)
      for (const declaration of customDeclarations(attrs.style))
        properties.push({ owner: record, ...declaration });
  }
  for (const style of text.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) {
    for (const rule of style[1].matchAll(/([^{}]+)\{([^{}]*)\}/g))
      for (const declaration of customDeclarations(decode(rule[2])))
        properties.push({
          selector: decode(rule[1].trim()),
          ...declaration,
        });
  }
  return { elements: canonical(elements), customProperties: canonical(properties) };
}
export function compareOutput(base, head, index) {
  const baseSurface = digest(JSON.stringify(publicSurface(base)));
  const headSurface = digest(JSON.stringify(publicSurface(head)));
  return {
    bytes: {
      index,
      baseSha256: digest(base),
      headSha256: digest(head),
      baseBytes: Buffer.byteLength(base),
      headBytes: Buffer.byteLength(head),
    },
    surface: {
      index,
      baseSha256: baseSurface,
      headSha256: headSurface,
      equal: baseSurface === headSurface,
    },
  };
}
export function envelope(kind, pins, scope, data) {
  for (const key of PIN_KEYS)
    if (!/^[a-f0-9]{64}$/.test(pins?.[key])) throw new Error(`Missing evidence pin ${key}`);
  if (!['formal', 'rehearsal'].includes(scope)) throw new Error('Explicit evidence scope required');
  return { schemaVersion: 1, kind, scope, pins, complete: true, ...data };
}
export function verifyPairPins(base, head, pins) {
  for (const [key, value] of Object.entries({
    baseSourceSha256: base.sourceDigest,
    headSourceSha256: head.sourceDigest,
    baseArtifactSha256: base.artifactDigest,
    headArtifactSha256: head.artifactDigest,
  }))
    if (pins[key] !== value) throw new Error(`Frozen artifact evidence mismatch: ${key}`);
}
export async function runGates({
  manifest,
  headManifest = manifest,
  records,
  out,
  pins,
  scope = 'formal',
}) {
  const base = verifyArtifacts(manifest);
  const head = verifyArtifacts(headManifest);
  verifyPairPins(base, head, pins);
  if (scope === 'formal' && records.length !== 5000)
    throw new Error('Formal byte/surface gates require all 5000 records');
  if (out) mkdirSync(resolve(out, 'svg'), { recursive: true });
  const worker = new Worker(new URL('./gates-worker.mjs', import.meta.url), {
    execArgv: process.execArgv.filter((argument) => !argument.startsWith('--input-type')),
    workerData: { entries: [base, head].map((m) => m.entries.v13.timing.entry) },
  });
  const byteRecords = [];
  const surfaceRecords = [];
  try {
    for (const [index, record] of records.entries()) {
      const outputs = await new Promise((done, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          worker.off('message', receive);
          worker.off('error', failed);
          worker.off('exit', exited);
        };
        const failed = (error) => {
          cleanup();
          reject(error);
        };
        const exited = (code) => failed(new Error(`Gate worker exited ${code}`));
        const receive = (reply) => {
          cleanup();
          if (reply.error) reject(new Error(reply.error));
          else done(reply.outputs);
        };
        const timer = setTimeout(
          () => failed(new Error(`Gate timed out at index ${index}`)),
          30000
        );
        worker.once('message', receive);
        worker.once('error', failed);
        worker.once('exit', exited);
        worker.postMessage({ source: record.source, index });
      });
      const compared = compareOutput(...outputs, index);
      if (out) {
        compared.bytes.raw = {};
        for (const [position, kind] of ['base', 'head'].entries()) {
          const path = resolve(out, 'svg', `${index}-${kind}.svg`);
          writeFileSync(path, outputs[position], { flag: 'wx' });
          compared.bytes.raw[kind] = path;
        }
      }
      byteRecords.push(compared.bytes);
      surfaceRecords.push(compared.surface);
    }
  } finally {
    await worker.terminate();
  }
  verifyArtifacts(base);
  verifyArtifacts(head);
  const result = {
    bytes: envelope('bytes', pins, scope, { records: byteRecords }),
    surface: envelope('surface', pins, scope, { records: surfaceRecords }),
  };
  if (out) {
    mkdirSync(out, { recursive: true });
    for (const [kind, data] of Object.entries(result))
      writeFileSync(resolve(out, `${kind}.json`), JSON.stringify(data) + '\n', { flag: 'wx' });
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      out: { type: 'string' },
      pins: { type: 'string' },
      rehearsal: { type: 'boolean' },
      limit: { type: 'string' },
    },
  });
  const { readSample } = await import('./common.mjs');
  const sample = await readSample();
  if (values.limit && !values.rehearsal) throw new Error('A limit requires --rehearsal');
  const result = await runGates({
    manifest: values.base,
    headManifest: values.head,
    out: values.out,
    pins: JSON.parse(readFileSync(values.pins, 'utf8')),
    scope: values.rehearsal ? 'rehearsal' : 'formal',
    records: values.limit ? sample.records.slice(0, Number(values.limit)) : sample.records,
  });
  console.log(
    JSON.stringify({
      records: result.bytes.records.length,
      byteIdentical: result.bytes.records.every((r) => r.baseSha256 === r.headSha256),
      publicSurfaceEqual: result.surface.records.every((r) => r.equal),
    })
  );
}
