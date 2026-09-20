/**
 * Deterministic file-signal extraction: dependency manifests, service config
 * files, env files. Pure functions of (toolName, toolInput).
 */
import type { EntityIntroduction, SignalAnchor } from '../events/types.js';
import { normalizeEntity } from '../trust/entities.js';

export interface FileSignals {
  introductions: EntityIntroduction[];
  anchors: SignalAnchor[];
}

const EMPTY: FileSignals = { introductions: [], anchors: [] };

/** Env-var prefixes that imply connecting to a known external service. */
const ENV_SERVICE_PREFIXES: ReadonlyArray<readonly [prefix: string, service: string]> = [
  ['SUPABASE', 'supabase'],
  ['STRIPE', 'stripe'],
  ['OPENAI', 'openai'],
  ['ANTHROPIC', 'anthropic'],
  ['AWS', 'aws'],
  ['FIREBASE', 'firebase'],
  ['AUTH0', 'auth0'],
  ['GOOGLE', 'gcp'],
  ['GCLOUD', 'gcp'],
  ['AZURE', 'azure'],
  ['TWILIO', 'twilio'],
  ['SENDGRID', 'sendgrid'],
  ['RESEND', 'resend'],
  ['ALGOLIA', 'algolia'],
  ['MONGODB', 'mongodb'],
  ['MONGO', 'mongodb'],
  ['REDIS', 'redis'],
];

/** Basenames that are config surfaces of a specific service. */
const SERVICE_CONFIG_FILES: ReadonlyArray<readonly [basename: string, service: string]> = [
  ['firebase.json', 'firebase'],
  ['vercel.json', 'vercel'],
  ['netlify.toml', 'netlify'],
  ['wrangler.toml', 'cloudflare'],
  ['supabase.toml', 'supabase'],
];

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
    ecosystem: normalized.ecosystem ?? ecosystem,
    via,
    detail,
  };
}

function fromImage(image: string, detail: string): EntityIntroduction {
  const withoutTag = image.split(':')[0] ?? image;
  const shortName = withoutTag.split('/').pop() ?? withoutTag;
  return intro(shortName, 'docker', 'install', detail);
}

function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() ?? normalized;
}

function fromEnvContent(content: string, detail: string): EntityIntroduction[] {
  const found = new Map<string, EntityIntroduction>();
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match) continue;
    const key = match[1] ?? '';
    for (const [prefix, service] of ENV_SERVICE_PREFIXES) {
      if (key === prefix || key.startsWith(`${prefix}_`)) {
        found.set(service, intro(service, undefined, 'manifest', detail));
        break;
      }
    }
  }
  return [...found.values()];
}

function fromRequirements(content: string, detail: string): EntityIntroduction[] {
  const results: EntityIntroduction[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const name = /^[A-Za-z0-9][A-Za-z0-9._-]*/.exec(trimmed)?.[0];
    if (name) results.push(intro(name, 'pypi', 'manifest', detail));
  }
  return results;
}

function fromPyproject(content: string, detail: string): EntityIntroduction[] {
  const results: EntityIntroduction[] = [];
  // PEP 621: dependencies = ["pkg>=1", ...] (single or multi-line array)
  const pepArray = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(content);
  if (pepArray?.[1]) {
    for (const match of pepArray[1].matchAll(/["']([^"'<>=!~,;[ ]+)/g)) {
      const name = match[1];
      if (name) results.push(intro(name, 'pypi', 'manifest', detail));
    }
  }
  // [tool.poetry.dependencies] name = "..." sections
  let section = '';
  for (const rawLine of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(rawLine);
    if (header) {
      section = header[1] ?? '';
      continue;
    }
    if (section === 'tool.poetry.dependencies') {
      const pair = /^\s*([A-Za-z0-9_.-]+)\s*=\s*["{]/.exec(rawLine);
      const name = pair?.[1];
      if (name && name !== 'python') results.push(intro(name, 'pypi', 'manifest', detail));
    }
  }
  return results;
}

function fromGoMod(content: string, detail: string): EntityIntroduction[] {
  const results: EntityIntroduction[] = [];
  const single = /^require\s+([^\s(]+)/gm;
  for (const match of content.matchAll(single)) {
    const module = match[1];
    if (module && !module.startsWith('//')) {
      results.push(
        intro(module.split('/').slice(-2).join('/') || module, 'go', 'manifest', detail),
      );
    }
  }
  const block = /require\s*\(([\s\S]*?)\)/.exec(content);
  if (block?.[1]) {
    for (const line of block[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.endsWith('// indirect')) continue;
      const module = trimmed.split(/\s+/)[0];
      if (module)
        results.push(
          intro(module.split('/').slice(-2).join('/') || module, 'go', 'manifest', detail),
        );
    }
  }
  return results;
}

function fromCargoToml(content: string, detail: string): EntityIntroduction[] {
  const results: EntityIntroduction[] = [];
  let section = '';
  for (const rawLine of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(rawLine);
    if (header) {
      section = header[1] ?? '';
      continue;
    }
    if (
      section === 'dependencies' ||
      section === 'dev-dependencies' ||
      section === 'build-dependencies'
    ) {
      const pair = /^\s*([A-Za-z0-9_-]+)\s*=\s*["{]/.exec(rawLine);
      const name = pair?.[1];
      if (name) results.push(intro(name, 'cargo', 'manifest', detail));
    }
  }
  return results;
}

function fromDockerfile(content: string, detail: string): EntityIntroduction[] {
  const results: EntityIntroduction[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*FROM\s+(\S+)/i.exec(line);
    const image = match?.[1];
    if (image) results.push(fromImage(image, detail));
  }
  return results;
}

function fromCompose(content: string, detail: string): EntityIntroduction[] {
  const results: EntityIntroduction[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*image:\s*(\S+)/.exec(line);
    const image = match?.[1];
    if (image) results.push(fromImage(image, detail));
  }
  return results;
}

function fromPackageJson(content: string, detail: string): EntityIntroduction[] {
  let parsed: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const results: EntityIntroduction[] = [];
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const) {
    const deps = parsed[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) results.push(intro(name, 'npm', 'manifest', detail));
  }
  return results;
}

/**
 * Extract signals from a Write/Edit tool call. `Write` gives full content and
 * is parsed; `Edit` only offers fragments, so it is trusted solely for
 * line-safe formats (requirements/Dockerfile/compose/.env) — everything else
 * records an anchor instead of guessing (false-positive control).
 */
export function extractFromFileWrite(filePath: string, content: string): FileSignals {
  const basename = basenameOf(filePath).toLowerCase();
  const detail = `write ${basename}`;

  if (basename === 'package.json') {
    return { introductions: fromPackageJson(content, detail), anchors: [] };
  }
  if (basename === 'requirements.txt') {
    return { introductions: fromRequirements(content, detail), anchors: [] };
  }
  if (basename === 'pyproject.toml') {
    return { introductions: fromPyproject(content, detail), anchors: [] };
  }
  if (basename === 'go.mod') {
    return { introductions: fromGoMod(content, detail), anchors: [] };
  }
  if (basename === 'cargo.toml') {
    return { introductions: fromCargoToml(content, detail), anchors: [] };
  }
  if (basename === 'dockerfile' || basename.endsWith('.dockerfile')) {
    return { introductions: fromDockerfile(content, detail), anchors: [] };
  }
  if (
    basename === 'docker-compose.yml' ||
    basename === 'docker-compose.yaml' ||
    basename === 'compose.yml' ||
    basename === 'compose.yaml'
  ) {
    return { introductions: fromCompose(content, detail), anchors: [] };
  }
  if (basename.startsWith('.env')) {
    return {
      introductions: fromEnvContent(content, detail),
      anchors: [{ kind: 'env_file', detail }],
    };
  }
  for (const [name, service] of SERVICE_CONFIG_FILES) {
    if (basename === name) {
      return {
        introductions: [intro(service, undefined, 'manifest', detail)],
        anchors: [],
      };
    }
  }
  if (basename.endsWith('.tf') || basename.endsWith('.tfvars')) {
    return { introductions: [], anchors: [{ kind: 'infra_file', detail }] };
  }
  return EMPTY;
}

/** Line-safe extraction from an Edit's new fragment. */
export function extractFromFileEdit(filePath: string, newString: string): FileSignals {
  const basename = basenameOf(filePath).toLowerCase();
  const detail = `edit ${basename}`;

  if (basename === 'requirements.txt') {
    return { introductions: fromRequirements(newString, detail), anchors: [] };
  }
  if (basename === 'dockerfile' || basename.endsWith('.dockerfile')) {
    return { introductions: fromDockerfile(newString, detail), anchors: [] };
  }
  if (
    basename === 'docker-compose.yml' ||
    basename === 'docker-compose.yaml' ||
    basename === 'compose.yml' ||
    basename === 'compose.yaml'
  ) {
    return { introductions: fromCompose(newString, detail), anchors: [] };
  }
  if (basename.startsWith('.env')) {
    return {
      introductions: fromEnvContent(newString, detail),
      anchors: [{ kind: 'env_file', detail }],
    };
  }
  if (
    basename === 'package.json' ||
    basename === 'pyproject.toml' ||
    basename === 'cargo.toml' ||
    basename === 'go.mod'
  ) {
    // fragments cannot be parsed safely → record only
    return { introductions: [], anchors: [{ kind: 'manifest_edit_unparsed', detail }] };
  }
  return EMPTY;
}
