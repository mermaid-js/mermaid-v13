#!/usr/bin/env node
/// <reference types="node" />
/**
 * The `mermaid` bin (D85, R-ASCII-4): `mermaid render [file|-] --format ascii|svg`.
 *
 * Zero-dependency (R-PERF-2): node builtins and this package only; `pnpm check:deps` checks the
 * bin's imports. Measures with the table measurer (`deterministic`, R-TEXT-7), so the output
 * is byte-identical everywhere. The diagram goes to stdout; diagnostics (R-ERR-2 snippet and
 * caret, already in `MermaidError.message`) go to stderr, warnings only with `--warnings`.
 * Exit 0 on success, 1 on an error (usage errors included), 2 on the API's UNSUPPORTED_FORMAT.
 * `--charset` and `--width` are explicit text options (`TextRenderOptions.ascii`): they win
 * over the diagram's own `ascii` config.
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  createMermaid,
  MermaidError,
  type InitializeConfig,
  type RenderResult,
  type TextRenderOptions,
  type TextRenderResult,
} from './index.ts';
import { VERSION } from './version.ts';

const USAGE = `Usage: mermaid render [file|-] --format ascii|svg [options]

Renders a Mermaid diagram from a file, or from stdin when the file is - or left out,
and writes it to stdout.

Options:
  --format ascii|svg       Output format (required). ascii is text in character cells.
  --charset unicode|ascii  Text glyph set: unicode box drawing (default) or pure ascii.
  --width N|auto           Fit text output into N columns; auto uses the terminal's width.
  --warnings               Write warnings to stderr.
  -h, --help               Show this help.
  -v, --version            Show the version.

--charset and --width win over ascii.charset and ascii.maxWidth set in the diagram
(front matter or directives); without them the diagram's own settings apply.

Errors go to stderr. Exit status: 0 on success, 1 on an error (a bad option or
--format value included), 2 when the diagram type cannot be rendered in the
requested format.
`;

const CONFIG: InitializeConfig = { deterministic: true };
const EXIT_ERROR = 1;
const EXIT_UNSUPPORTED = 2;

class UsageError extends Error {}

interface Command {
  file: string | undefined;
  format: string;
  /** `--charset` and `--width`: explicit, so they win over the diagram's own `ascii` config. */
  ascii: NonNullable<TextRenderOptions['ascii']>;
  warnings: boolean;
}

function terminalColumns(): number | undefined {
  const columns = process.stdout.columns || Number(process.env.COLUMNS);
  return Number.isInteger(columns) && columns > 0 ? columns : undefined;
}

function maxWidth(width: string | undefined): number | undefined {
  if (width === undefined) return undefined;
  // Not a TTY and no COLUMNS: no limit.
  if (width === 'auto') return terminalColumns();
  if (!/^\d+$/.test(width) || Number(width) < 1) {
    throw new UsageError(`--width must be a positive number or auto, got "${width}"`);
  }
  return Number(width);
}

type Charset = 'ascii' | 'unicode';

function glyphs(charset: string | undefined): Charset | undefined {
  if (charset === undefined || charset === 'ascii' || charset === 'unicode') return charset;
  throw new UsageError(`--charset must be ascii or unicode, got "${charset}"`);
}

function parse(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: 'string' },
        charset: { type: 'string' },
        width: { type: 'string' },
        warnings: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message, { cause: e });
  }
}

function command(argv: string[]): Command | 'help' | 'version' {
  const { values, positionals } = parse(argv);
  if (values.help) return 'help';
  if (values.version) return 'version';
  const [name, file, ...rest] = positionals;
  if (name !== 'render') {
    throw new UsageError(name === undefined ? 'missing command' : `unknown command "${name}"`);
  }
  if (rest.length > 0) throw new UsageError('render takes one file');
  if (values.format === undefined) throw new UsageError('--format ascii|svg is required');
  if (values.format !== 'ascii' && values.format !== 'svg')
    throw new UsageError(`--format must be ascii or svg, got "${values.format}"`);
  const charset = glyphs(values.charset);
  const width = maxWidth(values.width);
  const ascii: Command['ascii'] = {
    ...(charset === undefined ? {} : { charset }),
    ...(width === undefined ? {} : { maxWidth: width }),
  };
  return {
    file: file === '-' ? undefined : file,
    format: values.format,
    ascii,
    warnings: values.warnings,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function source(file: string | undefined): Promise<string> {
  if (file === undefined) return readStdin();
  try {
    return await readFile(file, 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? String(e);
    throw new Error(`cannot read ${file} (${code})`, { cause: e });
  }
}

async function render(cmd: Command, text: string): Promise<RenderResult | TextRenderResult> {
  const mermaid = createMermaid();
  // The API owns the list of formats: anything but svg/ascii is its UnsupportedFormatError.
  const options = {
    format: cmd.format,
    config: CONFIG,
    ascii: cmd.ascii,
  } as unknown as TextRenderOptions;
  await mermaid.prepare(text, options);
  return mermaid.renderSync(text, options);
}

function write(stream: NodeJS.WriteStream, text: string): void {
  stream.write(text.endsWith('\n') ? text : `${text}\n`);
}

async function main(argv: string[]): Promise<number> {
  let cmd: Command | 'help' | 'version';
  let text: string;
  try {
    cmd = command(argv);
    if (cmd === 'help') {
      process.stdout.write(USAGE);
      return 0;
    }
    if (cmd === 'version') {
      write(process.stdout, VERSION);
      return 0;
    }
    text = await source(cmd.file);
  } catch (e) {
    const hint = e instanceof UsageError ? "\nRun 'mermaid --help' for usage." : '';
    write(process.stderr, `mermaid: ${(e as Error).message}${hint}`);
    return EXIT_ERROR;
  }
  const name = cmd.file ?? '<stdin>';
  try {
    const result = await render(cmd, text);
    write(process.stdout, 'format' in result ? result.text : result.svg);
    if (cmd.warnings) {
      for (const w of result.warnings)
        write(process.stderr, `${name}: warning ${w.code}: ${w.message}`);
    }
    return 0;
  } catch (e) {
    write(process.stderr, `${name}: ${e instanceof Error ? e.message : String(e)}`);
    return e instanceof MermaidError && e.code === 'UNSUPPORTED_FORMAT'
      ? EXIT_UNSUPPORTED
      : EXIT_ERROR;
  }
}

process.exitCode = await main(process.argv.slice(2));
