/**
 * Trust Boundary entity model (spec §6, §10, §11).
 *
 * The boundary is an *awareness* surface, never an allowlist: it describes what
 * the user has reviewed; the agent remains free to use or propose anything.
 */

export type TrustStatus = 'unknown' | 'reviewed' | 'trusted' | 'restricted' | 'temporary';

export type Category =
  | 'library'
  | 'database'
  | 'external_service'
  | 'plugin_mcp'
  | 'cli_infra'
  | 'data_source';

export type Scope = 'global' | 'project' | 'session';

export type EntitySource = 'config' | 'cli' | 'builtin';

export interface TrustEntity {
  /** Canonical slug: `npm:react`, `pypi:fastapi`, `svc:supabase`, `docker:postgres`. */
  id: string;
  name: string;
  category: Category;
  ecosystem?: string;
  status: TrustStatus;
  scope: Scope;
  source: EntitySource;
  aliases?: string[];
  notes?: string;
  /** Epoch ms; for `temporary`. */
  expiresAt?: number;
}

export interface ResolvedTrust {
  status: TrustStatus;
  scope: Scope | 'default';
  entity?: TrustEntity;
}

/**
 * Compact builtin catalog: canonical names, categories, and common aliases so
 * that `pip install psycopg2`, `npm i pg` and `docker pull postgres` all resolve
 * to the same entity the user trusted as "PostgreSQL". Data, not policy — the
 * catalog never decides trust status, only identity and category.
 */
interface CatalogEntry {
  canonical: string;
  category: Category;
  aliases: string[];
}

const CATALOG: CatalogEntry[] = [
  // databases
  {
    canonical: 'PostgreSQL',
    category: 'database',
    aliases: ['postgres', 'pg', 'psycopg2', 'psycopg', 'node-postgres', 'pgx'],
  },
  { canonical: 'MySQL', category: 'database', aliases: ['mysql', 'mysql2', 'pymysql'] },
  {
    canonical: 'MongoDB',
    category: 'database',
    aliases: ['mongodb', 'mongoose', 'pymongo', 'mongo'],
  },
  {
    canonical: 'Redis',
    category: 'database',
    aliases: ['redis', 'ioredis', 'redis-py', 'aioredis'],
  },
  { canonical: 'SQLite', category: 'database', aliases: ['sqlite', 'sqlite3', 'better-sqlite3'] },
  { canonical: 'Elasticsearch', category: 'database', aliases: ['elasticsearch'] },
  { canonical: 'ClickHouse', category: 'database', aliases: ['clickhouse'] },
  { canonical: 'Snowflake', category: 'database', aliases: ['snowflake'] },
  { canonical: 'DynamoDB', category: 'database', aliases: ['dynamodb'] },
  // external services
  {
    canonical: 'Supabase',
    category: 'external_service',
    aliases: ['supabase', '@supabase/supabase-js'],
  },
  {
    canonical: 'Firebase',
    category: 'external_service',
    aliases: ['firebase', 'firebase-admin', 'firebase-tools', 'pyrebase'],
  },
  { canonical: 'AWS', category: 'external_service', aliases: ['aws', 'aws-cdk', 'boto3'] },
  { canonical: 'Amazon S3', category: 'external_service', aliases: ['s3'] },
  { canonical: 'Azure', category: 'external_service', aliases: ['azure', 'az'] },
  { canonical: 'Google Cloud', category: 'external_service', aliases: ['gcp', 'gcloud'] },
  { canonical: 'OpenAI', category: 'external_service', aliases: ['openai'] },
  {
    canonical: 'Anthropic',
    category: 'external_service',
    aliases: ['anthropic', '@anthropic-ai/sdk'],
  },
  { canonical: 'Stripe', category: 'external_service', aliases: ['stripe'] },
  { canonical: 'Auth0', category: 'external_service', aliases: ['auth0'] },
  { canonical: 'Vercel', category: 'external_service', aliases: ['vercel'] },
  { canonical: 'Netlify', category: 'external_service', aliases: ['netlify'] },
  { canonical: 'Cloudflare', category: 'external_service', aliases: ['cloudflare', 'wrangler'] },
  { canonical: 'Twilio', category: 'external_service', aliases: ['twilio'] },
  { canonical: 'SendGrid', category: 'external_service', aliases: ['sendgrid'] },
  { canonical: 'Resend', category: 'external_service', aliases: ['resend'] },
  { canonical: 'Algolia', category: 'external_service', aliases: ['algolia'] },
  // plugins / MCP
  { canonical: 'Playwright', category: 'plugin_mcp', aliases: ['playwright', '@playwright/test'] },
  { canonical: 'Puppeteer', category: 'plugin_mcp', aliases: ['puppeteer'] },
  // CLI / infrastructure
  { canonical: 'Docker', category: 'cli_infra', aliases: ['docker', 'docker-compose'] },
  { canonical: 'Kubernetes', category: 'cli_infra', aliases: ['kubectl', 'k8s', 'helm'] },
  { canonical: 'Terraform', category: 'cli_infra', aliases: ['terraform', 'opentofu', 'tofu'] },
  // common libraries that read as decisions
  { canonical: 'Next.js', category: 'library', aliases: ['next', 'next.js'] },
  { canonical: 'React', category: 'library', aliases: ['react'] },
  { canonical: 'Vue', category: 'library', aliases: ['vue'] },
  { canonical: 'Svelte', category: 'library', aliases: ['svelte'] },
  { canonical: 'Prisma', category: 'library', aliases: ['prisma', '@prisma/client'] },
  { canonical: 'Drizzle', category: 'library', aliases: ['drizzle-orm'] },
  { canonical: 'FastAPI', category: 'library', aliases: ['fastapi'] },
  { canonical: 'Flask', category: 'library', aliases: ['flask'] },
  { canonical: 'Django', category: 'library', aliases: ['django'] },
  { canonical: 'PyTorch', category: 'library', aliases: ['torch', 'pytorch'] },
  { canonical: 'LangChain', category: 'library', aliases: ['langchain'] },
];

const catalogByAlias = new Map<string, CatalogEntry>();
for (const entry of CATALOG) {
  for (const alias of [entry.canonical, ...entry.aliases]) {
    catalogByAlias.set(alias.toLowerCase(), entry);
  }
}

export function catalogLookup(name: string): CatalogEntry | undefined {
  return catalogByAlias.get(name.toLowerCase());
}

export function catalogCategory(name: string): Category | undefined {
  return catalogLookup(name)?.category;
}

/** Strip version specifiers: `pkg==1.0`, `pkg>=2`, `pkg@latest`, `@scope/pkg@2` → `pkg`. */
function stripVersion(name: string): string {
  let result = name;
  const spec = /[=<>~!;+]/.exec(result);
  if (spec?.index !== undefined) result = result.slice(0, spec.index);
  const at = result.lastIndexOf('@');
  if (at > 0) result = result.slice(0, at); // trailing @version / @latest (keeps @scope)
  return result.trim();
}

export interface NormalizedEntity {
  id: string;
  displayName: string;
  category: Category;
  ecosystem?: string;
}

const ID_PREFIX_RE = /^(npm|pypi|cargo|go|docker|mcp|svc):(.+)$/;

/**
 * Normalize a raw name (package, service, image, MCP server) into a canonical
 * entity id. Ecosystem-scoped packages get `ecosystem:name` ids; catalog hits
 * unify to `svc:` ids so trust travels across ecosystems (npm pg == pip psycopg2
 * == docker postgres). Explicitly prefixed names (`mcp:github`, `npm:react`)
 * are taken as fully-qualified ids so `hil trust add` can match signal ids
 * exactly.
 */
export function normalizeEntity(rawName: string, ecosystem?: string): NormalizedEntity {
  const raw = rawName.trim();
  const name = stripVersion(raw);
  const lower = name.toLowerCase();

  const prefixed = ID_PREFIX_RE.exec(lower);
  if (prefixed) {
    const prefix = prefixed[1] as string;
    const localName = prefixed[2] as string;
    const category =
      prefix === 'svc'
        ? (catalogLookup(localName)?.category ?? 'external_service')
        : prefix === 'mcp'
          ? 'plugin_mcp'
          : 'library';
    return {
      id: `${prefix}:${localName}`,
      displayName: catalogLookup(localName)?.canonical ?? localName,
      category,
      ...(prefix === 'svc' ? {} : { ecosystem: prefix }),
    };
  }

  const hit = catalogLookup(lower);
  if (hit) {
    return {
      id: `svc:${hit.canonical.toLowerCase().replace(/\s+/g, '-')}`,
      displayName: hit.canonical,
      category: hit.category,
      ...(ecosystem ? { ecosystem } : {}),
    };
  }

  if (ecosystem) {
    return { id: `${ecosystem}:${lower}`, displayName: name, category: 'library', ecosystem };
  }
  return {
    id: `svc:${lower.replace(/\s+/g, '-')}`,
    displayName: name,
    category: 'external_service',
  };
}

export const CATEGORIES: readonly Category[] = [
  'library',
  'database',
  'external_service',
  'plugin_mcp',
  'cli_infra',
  'data_source',
];

export const TRUST_STATUSES: readonly TrustStatus[] = [
  'unknown',
  'reviewed',
  'trusted',
  'restricted',
  'temporary',
];
