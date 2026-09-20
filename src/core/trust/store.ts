/**
 * Trust store: YAML (authoring, human-friendly) + SQLite (CLI-managed rows)
 * compile into JSON snapshots that the hot path reads. Keeps `yaml` and
 * `node:sqlite` off the hook path (CONTRIBUTING invariant #5).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { CompiledConfig, HilConfig } from '../config.js';
import { DEFAULT_CONFIG, normalizeLang } from '../config.js';
import type { HilPaths } from '../paths.js';
import type { Category, Scope, TrustEntity, TrustStatus } from './entities.js';
import { parseBoundaryYaml } from './yaml.js';

export interface TrustSnapshot {
  version: 1;
  updatedAt: number;
  entities: TrustEntity[];
}

export function emptySnapshot(): TrustSnapshot {
  return { version: 1, updatedAt: 0, entities: [] };
}

export function readTrustSnapshot(file: string): TrustSnapshot | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as TrustSnapshot;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.entities)) return parsed;
    return null;
  } catch {
    return null; // missing or corrupt → fail-open
  }
}

export function readConfigCache(file: string): CompiledConfig | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as CompiledConfig;
    if (parsed && typeof parsed.language === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

/** True when `cacheFile` is at least as new as every existing source file. */
export function isCacheFresh(cacheFile: string, sources: string[]): boolean {
  let cacheMtime = 0;
  try {
    cacheMtime = statSync(cacheFile).mtimeMs;
  } catch {
    return false;
  }
  for (const source of sources) {
    if (!existsSync(source)) continue;
    if (statSync(source).mtimeMs > cacheMtime) return false;
  }
  return true;
}

export function configFromCache(cache: CompiledConfig | null, envLang?: string): HilConfig {
  if (envLang) return { ...(cache ?? DEFAULT_CONFIG), language: normalizeLang(envLang) };
  if (cache) {
    const { updatedAt: _updatedAt, ...rest } = cache;
    return { ...DEFAULT_CONFIG, ...rest };
  }
  return { ...DEFAULT_CONFIG };
}

/** Raw row shape persisted in SQLite (`tools` table, spec §23). */
export interface ToolRow {
  id: string;
  name: string;
  category: Category;
  ecosystem: string | null;
  trust_status: TrustStatus;
  scope: Scope;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface CompileResult {
  global: TrustSnapshot;
  project: TrustSnapshot | null;
}

export function writeJson(file: string, data: unknown): void {
  mkdirSync(dirnameOf(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function dirnameOf(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '.' : file.slice(0, idx);
}

/**
 * Compile YAML + SQLite rows into snapshot caches. Dynamically imports the
 * heavy modules so callers on the hot path only pay for this when stale.
 */
export async function compileCaches(paths: HilPaths): Promise<CompileResult> {
  const [{ parse }, { openDb, listTools, closeDb }] = await Promise.all([
    import('yaml'),
    import('../../db/db.js'),
  ]);

  const globalEntities: TrustEntity[] = [];

  if (existsSync(paths.globalBoundaryYaml)) {
    globalEntities.push(
      ...parseBoundaryYaml(paths.globalBoundaryYaml, parse, { scope: 'global', source: 'config' }),
    );
  }
  if (existsSync(paths.globalDb)) {
    const db = openDb(paths.globalDb);
    try {
      for (const row of listTools(db)) {
        const entity: TrustEntity = {
          id: row.id,
          name: row.name,
          category: row.category,
          status: row.trust_status,
          scope: row.scope,
          source: 'cli',
          ...(row.ecosystem ? { ecosystem: row.ecosystem } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
        };
        // YAML (explicit human intent) wins over CLI rows on the same id
        if (!globalEntities.some((e) => e.id === entity.id)) globalEntities.push(entity);
      }
    } finally {
      closeDb(db);
    }
  }

  const global: TrustSnapshot = {
    version: 1,
    updatedAt: Date.now(),
    entities: globalEntities,
  };
  writeJson(paths.globalTrustCache, global);

  let project: TrustSnapshot | null = null;
  if (existsSync(paths.projectBoundaryYaml)) {
    project = {
      version: 1,
      updatedAt: Date.now(),
      entities: parseBoundaryYaml(paths.projectBoundaryYaml, parse, {
        scope: 'project',
        source: 'config',
      }),
    };
    writeJson(paths.projectTrustCache, project);
  }

  const config = compileConfig(paths, parse);
  writeJson(paths.globalConfigCache, config);
  return { global, project };
}

interface ConfigYamlShape {
  language?: { default?: string; available?: string[] };
  intervention?: {
    cooldown_minutes?: number;
    muted?: boolean;
    muted_categories?: string[];
  };
  semantic?: { enabled?: boolean };
}

function compileConfig(paths: HilPaths, parse: (text: string) => unknown): CompiledConfig {
  const merged: HilConfig = { ...DEFAULT_CONFIG };

  for (const file of [paths.globalConfigYaml, paths.projectConfigYaml]) {
    if (!existsSync(file)) continue;
    try {
      const raw = parse(readFileSync(file, 'utf8')) as ConfigYamlShape | null;
      if (!raw) continue;
      if (raw.language?.default) merged.language = normalizeLang(raw.language.default);
      if (typeof raw.intervention?.cooldown_minutes === 'number') {
        merged.cooldownMinutes = raw.intervention.cooldown_minutes;
      }
      if (raw.intervention?.muted === true) merged.mutedAll = true;
      if (Array.isArray(raw.intervention?.muted_categories)) {
        merged.mutedCategories = raw.intervention.muted_categories as Category[];
      }
      if (typeof raw.semantic?.enabled === 'boolean') merged.semanticEnabled = raw.semantic.enabled;
    } catch {
      // malformed config → defaults remain
    }
  }
  return { ...merged, updatedAt: Date.now() };
}
