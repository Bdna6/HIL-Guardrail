/**
 * Deterministic command-signal extraction (spec §26): pure functions from a
 * shell command string to entity introductions. No I/O, no state.
 */
import type { EntityIntroduction } from '../events/types.js';
import { catalogLookup, normalizeEntity } from '../trust/entities.js';

/** Tokenize a shell segment respecting single/double quotes. */
export function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (const char of segment) {
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Split a command line into top-level segments on `&&`, `||`, `;`, `|` and
 * newline. Quote-aware; approximate by design — observation is cheap, and
 * intervention always requires corroboration from the trust store.
 */
export function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      segments.push(current);
      current = '';
      i++;
      continue;
    }
    if (char === ';' || char === '|' || char === '\n') {
      segments.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

const EXT_RE = /\.(cmd|exe|bat|ps1)$/i;

/** Resolve the program name of a token: strip paths and Windows extensions. */
export function programOf(token: string): string {
  let name = token;
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  if (slash >= 0) name = name.slice(slash + 1);
  return name.replace(EXT_RE, '').toLowerCase();
}

const RUNNERS = new Set(['npx', 'pnpx', 'bunx', 'uvx']);

/** Strip env-assignment prefixes, `sudo`, and package runners. */
function stripWrappers(tokens: string[]): {
  program: string;
  rest: string[];
  runnerTarget?: string;
} {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? '')) i++;
  let program = '';
  let runnerTarget: string | undefined;
  for (; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    const name = programOf(token);
    if (name === 'sudo') continue;
    if (RUNNERS.has(name)) {
      // first non-flag token after the runner is the package being executed
      const target = tokens.slice(i + 1).find((arg) => !arg.startsWith('-'));
      runnerTarget = target;
      program = name;
      i++;
      break;
    }
    program = name;
    i++;
    break;
  }
  return { program, rest: tokens.slice(i), runnerTarget };
}

const NPM_INSTALL = new Set(['install', 'i', 'add']);

/** Shell redirection / fd-dup tokens (`2>&1`, `>file`, `2>`, `&1`) are never package names. */
function isRedirection(arg: string): boolean {
  return /^\d*[<>]/.test(arg) || arg.startsWith('&');
}

const BARE_REDIRECT = /^\d*[<>]+&?$/;

/** Drop redirection tokens and their file targets (`> /dev/null`, `2>&1`, `>out.log`). */
function dropRedirections(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    if (isRedirection(token)) {
      if (BARE_REDIRECT.test(token)) i++; // target comes as the next token
      continue;
    }
    out.push(token);
  }
  return out;
}

/** npm-style: skip flags, redirections, and URLs. */
function npmPackages(args: string[]): string[] {
  return args.filter(
    (arg) =>
      !arg.startsWith('-') && !/^https?:\/\//.test(arg) && arg !== '.' && !isRedirection(arg),
  );
}

/** pip-style: also skip `-r/--requirement/-e/--editable` and their values. */
function pipPackages(args: string[]): string[] {
  const pkgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '-r' || arg === '--requirement' || arg === '-e' || arg === '--editable') {
      i++; // skip the value
      continue;
    }
    if (arg.startsWith('-')) continue;
    if (/^https?:\/\//.test(arg) || arg === '.' || isRedirection(arg)) continue;
    pkgs.push(arg);
  }
  return pkgs;
}

const SERVICE_INIT_SUBCOMMANDS = new Set([
  'init',
  'login',
  'auth',
  'configure',
  'config',
  'deploy',
  'link',
  'connect',
  'connect-to-project',
]);

function intro(
  rawName: string,
  ecosystem: string | undefined,
  via: EntityIntroduction['via'],
  detail: string,
): EntityIntroduction {
  const normalized = normalizeEntity(rawName, ecosystem);
  return {
    entityId: normalized.id,
    displayName: normalized.displayName,
    category: normalized.category,
    ...(normalized.ecosystem ? { ecosystem: normalized.ecosystem } : {}),
    via,
    detail,
  };
}

/** Extract entity introductions from one shell command line. */
export function extractFromCommand(command: string): EntityIntroduction[] {
  const results: EntityIntroduction[] = [];
  for (const segment of splitSegments(command)) {
    const tokens = dropRedirections(tokenize(segment));
    if (tokens.length === 0) continue;
    const { program, rest, runnerTarget } = stripWrappers(tokens);
    if (!program) continue;

    // npx/bunx/uvx <pkg> — only project generators (`create-*`) count as
    // introducing a technology; running already-known dev tools (npx vitest,
    // npx tsc) is routine work and must stay silent.
    if (RUNNERS.has(program) && runnerTarget) {
      if (runnerTarget.startsWith('create-')) {
        results.push(intro(runnerTarget, program === 'uvx' ? 'pypi' : 'npm', 'install', segment));
      }
      continue;
    }

    const [sub, ...args] = rest;

    switch (program) {
      case 'npm':
      case 'pnpm':
      case 'yarn':
      case 'bun':
        if (sub && NPM_INSTALL.has(sub)) {
          for (const pkg of npmPackages(args)) results.push(intro(pkg, 'npm', 'install', segment));
        }
        break;
      case 'pip':
      case 'pip3':
      case 'pipenv':
        if (sub === 'install') {
          for (const pkg of pipPackages(args)) results.push(intro(pkg, 'pypi', 'install', segment));
        }
        break;
      case 'python':
      case 'python3':
        if (sub === '-m' && args[0] === 'pip' && args[1] === 'install') {
          for (const pkg of pipPackages(args.slice(2)))
            results.push(intro(pkg, 'pypi', 'install', segment));
        }
        break;
      case 'uv':
        if (sub === 'add') {
          for (const pkg of npmPackages(args)) results.push(intro(pkg, 'pypi', 'install', segment));
        } else if (sub === 'pip' && args[0] === 'install') {
          for (const pkg of pipPackages(args.slice(1)))
            results.push(intro(pkg, 'pypi', 'install', segment));
        }
        break;
      case 'poetry':
        if (sub === 'add') {
          for (const pkg of npmPackages(args)) results.push(intro(pkg, 'pypi', 'install', segment));
        }
        break;
      case 'cargo':
        if (sub === 'add') {
          for (const pkg of npmPackages(args))
            results.push(intro(pkg, 'cargo', 'install', segment));
        }
        break;
      case 'go':
        if (sub === 'get') {
          const target = args.find((arg) => !arg.startsWith('-'));
          if (target) {
            const module = target.replace(/\.{3}$/, '');
            const short = module.split('/').slice(-2).join('/') || module;
            results.push(intro(short, 'go', 'install', segment));
          }
        }
        break;
      case 'docker':
      case 'podman':
        if (sub === 'pull') {
          const image = args.find((arg) => !arg.startsWith('-'));
          if (image) {
            const withoutTag = (image.split(':')[0] ?? image) as string;
            const shortName = withoutTag.split('/').pop() ?? withoutTag;
            results.push(intro(shortName, 'docker', 'install', segment));
          }
        } else if (sub === 'compose') {
          results.push(intro('docker', undefined, 'service_cli', segment));
        }
        break;
      case 'claude':
      case 'codex':
        if (sub === 'mcp' && args[0] === 'add') {
          const server = args.filter((arg) => !arg.startsWith('-'))[1];
          if (server) results.push(intro(server, 'mcp', 'mcp', segment));
        }
        break;
      default:
        // Service CLI lifecycle subcommands (init/login/deploy/…) — only for
        // services in the builtin catalog, so `git init` and friends never fire.
        if (sub && SERVICE_INIT_SUBCOMMANDS.has(sub) && catalogLookup(program)) {
          results.push(intro(program, undefined, 'service_cli', segment));
        }
    }
  }
  return results;
}
