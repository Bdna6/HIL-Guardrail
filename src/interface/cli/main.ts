#!/usr/bin/env node
/**
 * `hil` command-line interface. Heavy modules (yaml, node:sqlite, adapters)
 * are imported lazily per subcommand so `hil hook` stays fast (hot path).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from '../../core/config.js';
import { normalizeLang } from '../../core/config.js';
import { t } from '../../core/i18n/index.js';
import { resolvePaths } from '../../core/paths.js';
import type { Category, TrustStatus } from '../../core/trust/entities.js';
import {
  CATEGORIES,
  catalogCategory,
  normalizeEntity,
  TRUST_STATUSES,
} from '../../core/trust/entities.js';
import { configFromCache, readConfigCache } from '../../core/trust/store.js';
import { version } from '../../index.js';

// ---------- tiny argv parser ----------

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length && !(argv[i + 1] ?? '').startsWith('-')) {
        flags[arg.slice(2)] = argv[i + 1] as string;
        i++;
      } else {
        flags[arg.slice(2)] = true;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length === 2) {
      flags[arg.slice(1)] = true;
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

// ---------- helpers ----------

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function resolveLang(flags: Record<string, string | boolean>): Lang {
  const fromFlag = flagString(flags, 'lang');
  if (fromFlag) return normalizeLang(fromFlag);
  if (process.env.HIL_LANG) return normalizeLang(process.env.HIL_LANG);
  const paths = resolvePaths(process.cwd());
  return normalizeLang(configFromCache(readConfigCache(paths.globalConfigCache)).language);
}

function timeOf(at: number): string {
  return new Date(at).toISOString().replace('T', ' ').slice(0, 19);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---------- commands ----------

async function cmdHook(flags: Record<string, string | boolean>): Promise<void> {
  const raw = await readStdin();
  const langFlag = flagString(flags, 'lang');
  if (langFlag) process.env.HIL_LANG = normalizeLang(langFlag); // manual testing aid
  const { handleHook } = await import('../../adapters/claude-code/index.js');
  const { stdout } = await handleHook(raw);
  if (stdout.length > 0) process.stdout.write(`${stdout}\n`);
  process.exit(0); // always 0: fail-open
}

async function cmdInstall(
  flags: Record<string, string | boolean>,
  T: ReturnType<typeof makeT>,
): Promise<void> {
  const scopeRaw = flagString(flags, 'scope') ?? 'user';
  if (!['user', 'project', 'local'].includes(scopeRaw)) fail(`invalid --scope: ${scopeRaw}`);
  const { installHooks } = await import('../../adapters/claude-code/install.js');
  const { settings, command } = installHooks(
    scopeRaw as 'user' | 'project' | 'local',
    process.cwd(),
  );
  console.log(T('cli.install.wroteSettings', { file: settings }));
  console.log(T('cli.install.wroteCommand', { file: command }));
  console.log(T('cli.install.done'));
}

async function cmdUninstall(
  flags: Record<string, string | boolean>,
  T: ReturnType<typeof makeT>,
): Promise<void> {
  const scopeRaw = flagString(flags, 'scope') ?? 'user';
  if (!['user', 'project', 'local'].includes(scopeRaw)) fail(`invalid --scope: ${scopeRaw}`);
  const { uninstallHooks } = await import('../../adapters/claude-code/install.js');
  const { settings, removed } = uninstallHooks(
    scopeRaw as 'user' | 'project' | 'local',
    process.cwd(),
  );
  console.log(
    removed
      ? T('cli.uninstall.done', { file: settings })
      : T('cli.uninstall.nothing', { file: settings }),
  );
  // state files are derived data that can outlive the hooks themselves —
  // a crashed session never fires SessionEnd, so purge them here (spec §22)
  const { clearAllSessionStates } = await import('../../core/state/session.js');
  const cleared = clearAllSessionStates(resolvePaths(process.cwd()).stateDir);
  if (cleared > 0) console.log(T('cli.uninstall.clearedStates', { count: cleared }));
}

interface TrustMutationResult {
  lines: string[];
}

async function cmdTrust(
  positionals: string[],
  flags: Record<string, string | boolean>,
  lang: Lang,
  T: ReturnType<typeof makeT>,
): Promise<void> {
  const sub = positionals[0];
  const names = positionals.slice(1);
  const scope = flagString(flags, 'scope') ?? 'global';

  if (sub === 'add' && names.length > 0) {
    const statusRaw = (flagString(flags, 'status') ?? 'trusted') as TrustStatus;
    if (!TRUST_STATUSES.includes(statusRaw)) fail(`invalid --status: ${statusRaw}`);
    const categoryFlag = flagString(flags, 'category');
    if (categoryFlag && !CATEGORIES.includes(categoryFlag as Category)) {
      fail(`invalid --category: ${categoryFlag}`);
    }
    const result = await addTrust(names, {
      category: categoryFlag as Category | undefined,
      status: statusRaw,
      scope,
      ...(flagString(flags, 'session-id') ? { sessionId: flagString(flags, 'session-id') } : {}),
      ...(flagString(flags, 'notes') ? { notes: flagString(flags, 'notes') } : {}),
    });
    for (const line of result.lines) console.log(line);
    return;
  }

  if (sub === 'remove' && (names[0] ?? '') !== '') {
    const target = names[0] as string;
    const removed = await removeTrust(target, scope);
    console.log(
      removed
        ? T('cli.trust.removed', { name: target, scope: T(`scope.${scope}`) })
        : T('cli.trust.notFound', { name: target, scope: T(`scope.${scope}`) }),
    );
    void lang;
    return;
  }

  if (sub === 'list') {
    await cmdTrustList(scope, T);
    return;
  }

  fail(T('cli.unknownCommand', { command: `trust ${sub ?? ''}`.trim() }));
}

async function addTrust(
  names: string[],
  opts: {
    category: Category | undefined;
    status: TrustStatus;
    scope: string;
    sessionId?: string;
    notes?: string;
  },
): Promise<TrustMutationResult> {
  const paths = resolvePaths(process.cwd());
  const lines: string[] = [];
  const lang = resolveLang({});
  const T = makeT(lang);

  if (opts.scope === 'session') {
    // without an explicit id, target the most recent active session (the /hil flow)
    const target = opts.sessionId ?? (await findSessionState(paths.stateDir, undefined))?.id;
    if (!target) fail(T('cli.trust.sessionIdRequired'));
    const { loadSessionState, saveSessionState } = await import('../../core/state/session.js');
    const state = loadSessionState(paths.stateDir, target, Date.now());
    for (const name of names) {
      const normalized = normalizeEntity(name);
      state.temporaryTrust = state.temporaryTrust.filter((g) => g.id !== normalized.id);
      state.temporaryTrust.push({
        id: normalized.id,
        status: opts.status === 'restricted' ? 'restricted' : 'trusted',
      });
      lines.push(
        T('cli.trust.added', {
          name: normalized.displayName,
          status: opts.status,
          category: T(`category.${opts.category ?? normalized.category}`),
          scope: T('scope.session'),
        }),
      );
    }
    saveSessionState(paths.stateDir, state);
    return { lines };
  }

  if (opts.scope === 'project') {
    const { parse, stringify } = await import('yaml');
    const file = paths.projectBoundaryYaml;
    const doc = existsSync(file)
      ? ((parse(readFileSync(file, 'utf8')) as { version?: number; tools?: unknown[] }) ?? {})
      : {};
    const tools = Array.isArray(doc.tools) ? (doc.tools as Record<string, unknown>[]) : [];
    for (const name of names) {
      const normalized = normalizeEntity(name);
      const entry = {
        name: normalized.displayName,
        category: opts.category ?? normalized.category,
        status: opts.status,
        ...(normalized.ecosystem ? { ecosystem: normalized.ecosystem } : {}),
        ...(opts.notes ? { notes: opts.notes } : {}),
      };
      const existing = tools.findIndex(
        (tool) => typeof tool.name === 'string' && normalizeEntity(tool.name).id === normalized.id,
      );
      if (existing >= 0) tools[existing] = entry;
      else tools.push(entry);
      lines.push(
        T('cli.trust.added', {
          name: normalized.displayName,
          status: opts.status,
          category: T(`category.${entry.category}`),
          scope: T('scope.project'),
        }),
      );
    }
    doc.tools = tools;
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(paths.projectHilDir, { recursive: true });
    writeFileSync(file, stringify(doc), 'utf8');
    const { compileCaches } = await import('../../core/trust/store.js');
    await compileCaches(paths);
    return { lines };
  }

  // global (default): SQLite store
  const { openDb, upsertTool, closeDb } = await import('../../db/db.js');
  const db = openDb(paths.globalDb);
  try {
    for (const name of names) {
      const normalized = normalizeEntity(name);
      const category =
        opts.category ?? catalogCategory(normalized.displayName) ?? normalized.category;
      upsertTool(db, {
        id: normalized.id,
        name: normalized.displayName,
        category,
        ...(normalized.ecosystem ? { ecosystem: normalized.ecosystem } : {}),
        trustStatus: opts.status,
        scope: 'global',
        ...(opts.notes ? { notes: opts.notes } : {}),
      });
      lines.push(
        T('cli.trust.added', {
          name: normalized.displayName,
          status: opts.status,
          category: T(`category.${category}`),
          scope: T('scope.global'),
        }),
      );
    }
  } finally {
    closeDb(db);
  }
  const { compileCaches } = await import('../../core/trust/store.js');
  await compileCaches(paths);
  return { lines };
}

async function removeTrust(name: string, scope: string): Promise<boolean> {
  const paths = resolvePaths(process.cwd());
  const normalized = normalizeEntity(name);

  if (scope === 'project') {
    const { parse, stringify } = await import('yaml');
    const file = paths.projectBoundaryYaml;
    if (!existsSync(file)) return false;
    const doc = (parse(readFileSync(file, 'utf8')) as { tools?: Array<{ name: string }> }) ?? {};
    const before = doc.tools?.length ?? 0;
    doc.tools = (doc.tools ?? []).filter((tool) => normalizeEntity(tool.name).id !== normalized.id);
    if (doc.tools.length === before) return false;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, stringify(doc), 'utf8');
    const { compileCaches } = await import('../../core/trust/store.js');
    await compileCaches(paths);
    return true;
  }

  const { openDb, deleteTool, closeDb } = await import('../../db/db.js');
  const db = openDb(paths.globalDb);
  let removed = false;
  try {
    removed = deleteTool(db, normalized.id) || deleteTool(db, name.toLowerCase());
  } finally {
    closeDb(db);
  }
  const { compileCaches } = await import('../../core/trust/store.js');
  await compileCaches(paths);
  return removed;
}

async function cmdTrustList(scope: string, T: ReturnType<typeof makeT>): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const { compileCaches, readTrustSnapshot } = await import('../../core/trust/store.js');
  await compileCaches(paths);
  for (const level of scope === 'project'
    ? ['project']
    : scope === 'global'
      ? ['global']
      : ['global', 'project']) {
    const file = level === 'global' ? paths.globalTrustCache : paths.projectTrustCache;
    const snapshot = readTrustSnapshot(file);
    const entities = snapshot?.entities ?? [];
    if (entities.length === 0) {
      console.log(T('cli.trust.listEmpty', { scope: T(`scope.${level}`) }));
      continue;
    }
    console.log(T('cli.trust.listHeader', { scope: T(`scope.${level}`), count: entities.length }));
    for (const entity of entities) {
      console.log(
        `  ${entity.name}  [${entity.status}] ${T(`category.${entity.category}`)}  (${entity.id})`,
      );
    }
  }
}

async function findSessionState(
  stateDir: string,
  sessionId: string | undefined,
): Promise<{ id: string } | null> {
  if (sessionId) return { id: sessionId };
  if (!existsSync(stateDir)) return null;
  const files = readdirSync(stateDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return null;
  let newest: { file: string; mtime: number } | null = null;
  for (const file of files) {
    const mtime = statSync(join(stateDir, file)).mtimeMs;
    if (!newest || mtime > newest.mtime) newest = { file, mtime };
  }
  if (!newest) return null;
  return { id: newest.file.replace(/\.json$/, '') };
}

async function cmdStatus(
  flags: Record<string, string | boolean>,
  T: ReturnType<typeof makeT>,
): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const { readTrustSnapshot } = await import('../../core/trust/store.js');
  const globalCount = readTrustSnapshot(paths.globalTrustCache)?.entities.length ?? 0;
  const projectCount = readTrustSnapshot(paths.projectTrustCache)?.entities.length ?? 0;

  const session = await findSessionState(paths.stateDir, flagString(flags, 'session-id'));
  const { loadSessionState } = await import('../../core/state/session.js');
  const state = session ? loadSessionState(paths.stateDir, session.id, Date.now()) : undefined;

  console.log(T('cli.status.header'));
  console.log(
    T('cli.status.boundary', {
      global: globalCount,
      project: projectCount,
      session: state?.temporaryTrust.length ?? 0,
    }),
  );

  if (!session || !state) {
    console.log(T('cli.status.noSession'));
    return;
  }

  const agent = state.decisions.filter((d) => d.owner === 'agent').length;
  const human = state.decisions.filter((d) => d.owner === 'human').length;

  console.log(
    T('cli.status.session', {
      id: session.id.slice(0, 8),
      turns: state.turnCount,
      inputs: state.humanInputs.length,
    }),
  );
  console.log(T('cli.status.decisions', { count: state.decisions.length, agent, human }));
  console.log(T('cli.status.interventions', { count: state.interventionHistory.length }));
  for (const item of state.interventionHistory.slice(-10)) {
    console.log(
      T('cli.status.interventionsRow', {
        at: timeOf(item.at),
        level: item.level,
        category: T(`category.${item.category}`),
        entities: item.entityIds.join(', '),
      }),
    );
  }
  const now = Date.now();
  const cooldowns = Object.entries(state.cooldowns)
    .filter(([, until]) => (until ?? 0) > now)
    .map(([category, until]) => `${category}→${Math.ceil(((until ?? now) - now) / 60000)}min`);
  console.log(
    T('cli.status.cooldowns', {
      list: cooldowns.length > 0 ? cooldowns.join(', ') : T('label.none'),
    }),
  );
  if (state.muted.session || state.muted.categories.length > 0) {
    console.log(
      T('cli.status.muted', {
        session: String(state.muted.session),
        categories: state.muted.categories.join(', ') || T('label.none'),
      }),
    );
  } else {
    console.log(T('cli.status.notMuted'));
  }
}

async function cmdReview(
  flags: Record<string, string | boolean>,
  T: ReturnType<typeof makeT>,
): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const session = await findSessionState(paths.stateDir, flagString(flags, 'session-id'));
  if (!session) {
    console.log(T('cli.status.noSession'));
    return;
  }
  const { loadSessionState } = await import('../../core/state/session.js');
  const state = loadSessionState(paths.stateDir, session.id, Date.now());
  console.log(T('cli.review.header', { id: session.id.slice(0, 8) }));
  if (state.decisions.length === 0) {
    console.log(T('cli.review.empty'));
    return;
  }
  for (const decision of state.decisions.slice(-50)) {
    console.log(
      T('cli.review.row', {
        at: timeOf(decision.at),
        owner: decision.owner,
        summary: decision.summary,
      }),
    );
  }
}

async function cmdMute(
  flags: Record<string, string | boolean>,
  on: boolean,
  T: ReturnType<typeof makeT>,
): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const sessionId = flagString(flags, 'session-id');
  const category = flagString(flags, 'category') as Category | undefined;

  if (sessionId) {
    const { loadSessionState, saveSessionState } = await import('../../core/state/session.js');
    const state = loadSessionState(paths.stateDir, sessionId, Date.now());
    if (category) {
      state.muted.categories = on
        ? [...new Set([...state.muted.categories, category])]
        : state.muted.categories.filter((c) => c !== category);
    } else {
      state.muted.session = on;
    }
    saveSessionState(paths.stateDir, state);
    console.log(
      T(on ? 'cli.mute.session.done' : 'cli.resume.session.done', { id: sessionId.slice(0, 8) }),
    );
    return;
  }

  // config-level mute: project config if `.hil` exists, else global
  const useProject = existsSync(paths.projectHilDir);
  const file = useProject ? paths.projectConfigYaml : paths.globalConfigYaml;
  const { parse, stringify } = await import('yaml');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const doc = existsSync(file)
    ? ((parse(readFileSync(file, 'utf8')) as Record<string, unknown>) ?? {})
    : {};
  const intervention = (doc.intervention ?? {}) as Record<string, unknown>;
  if (category) {
    const list = new Set(
      (Array.isArray(intervention.muted_categories)
        ? intervention.muted_categories
        : []) as string[],
    );
    if (on) list.add(category);
    else list.delete(category);
    intervention.muted_categories = [...list];
  } else {
    intervention.muted = on;
  }
  doc.intervention = intervention;
  mkdirSync(useProject ? paths.projectHilDir : paths.hilHome, { recursive: true });
  writeFileSync(file, stringify(doc), 'utf8');
  const { compileCaches } = await import('../../core/trust/store.js');
  await compileCaches(paths);
  console.log(
    T(on ? 'cli.mute.done' : 'cli.resume.done', {
      scope: T(useProject ? 'scope.project' : 'scope.global'),
    }),
  );
}

async function cmdSync(T: ReturnType<typeof makeT>): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const { compileCaches } = await import('../../core/trust/store.js');
  const result = await compileCaches(paths);
  console.log(
    T('cli.sync.done', {
      global: result.global.entities.length,
      project: result.project?.entities.length ?? 0,
    }),
  );
}

// ---------- entry ----------

function makeT(lang: Lang) {
  return (key: string, params?: Record<string, string | number>) => t(lang, key, params);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { positionals, flags } = parseArgs(argv);
  const lang = resolveLang(flags);
  const T = makeT(lang);

  if (flags.v === true || flags.version === true) {
    console.log(T('cli.version', { version }));
    return;
  }

  const command = positionals[0] ?? 'help';
  if (command === 'help' || flags.h === true || flags.help === true) {
    console.log(T('cli.help'));
    return;
  }

  try {
    switch (command) {
      case 'hook':
        await cmdHook(flags);
        break;
      case 'install':
        await cmdInstall(flags, T);
        break;
      case 'uninstall':
        await cmdUninstall(flags, T);
        break;
      case 'trust':
        await cmdTrust(positionals.slice(1), flags, lang, T);
        break;
      case 'status':
        await cmdStatus(flags, T);
        break;
      case 'review':
        await cmdReview(flags, T);
        break;
      case 'mute':
        await cmdMute(flags, true, T);
        break;
      case 'resume':
        await cmdMute(flags, false, T);
        break;
      case 'sync':
        await cmdSync(T);
        break;
      default:
        fail(T('cli.unknownCommand', { command }));
    }
  } catch (error) {
    fail(T('cli.error', { message: (error as Error).message }));
  }
}

await main();
