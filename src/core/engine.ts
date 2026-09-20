/**
 * The session engine: CoreEvent in → Outcome out, with ephemeral state and
 * trust resolution wired. Used by every adapter; owns no agent specifics.
 */

import type { HilConfig } from './config.js';
import type { CoreEvent, EntityIntroduction } from './events/types.js';
import type { Outcome } from './intervention/policy.js';
import { evaluateIntroductions } from './intervention/policy.js';
import type { HilPaths } from './paths.js';
import { extractSignals } from './signals/index.js';
import type { SessionState } from './state/session.js';
import {
  deleteSessionState,
  loadSessionState,
  markDecided,
  pruneOldStates,
  recordHumanInput,
  saveSessionState,
} from './state/session.js';
import type { TrustIndex } from './trust/resolve.js';
import { buildIndex, resolve } from './trust/resolve.js';
import {
  compileCaches,
  configFromCache,
  isCacheFresh,
  readConfigCache,
  readTrustSnapshot,
} from './trust/store.js';

export interface EngineDeps {
  paths: HilPaths;
  config: HilConfig;
  now: () => number;
}

export interface EngineResult {
  outcome: Outcome;
  /** The introductions relevant to an ask (for rendering / tracing). */
  state: SessionState;
}

const STATE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** Load trust indexes, recompiling caches when sources changed. */
export async function loadTrustWorld(paths: HilPaths): Promise<{
  global: TrustIndex;
  project?: TrustIndex;
}> {
  const globalSources = [paths.globalBoundaryYaml, paths.globalConfigYaml, paths.globalDb];
  const projectSources = [paths.projectBoundaryYaml, paths.projectConfigYaml];

  const globalFresh = isCacheFresh(paths.globalTrustCache, globalSources);
  const projectFresh = isCacheFresh(paths.projectTrustCache, projectSources);
  if (!globalFresh || !projectFresh) {
    try {
      await compileCaches(paths);
    } catch {
      // compilation is an optimization; stale/absent caches resolve to unknown (fail-open)
    }
  }

  const global = buildIndex(readTrustSnapshot(paths.globalTrustCache)?.entities ?? []);
  const projectSnapshot = readTrustSnapshot(paths.projectTrustCache);
  return { global, project: projectSnapshot ? buildIndex(projectSnapshot.entities) : undefined };
}

export async function loadConfigWithFallback(
  paths: HilPaths,
  envLang: string | undefined,
): Promise<{
  config: ReturnType<typeof configFromCache>;
  world: Awaited<ReturnType<typeof loadTrustWorld>>;
}> {
  const world = await loadTrustWorld(paths);
  const cache = readConfigCache(paths.globalConfigCache);
  return { config: configFromCache(cache, envLang), world };
}

/** Process one event end-to-end. */
export async function processEvent(event: CoreEvent, deps: EngineDeps): Promise<EngineResult> {
  const now = deps.now();
  const { paths, config } = deps;

  if (event.kind === 'session_start') {
    pruneOldStates(paths.stateDir, STATE_MAX_AGE_MS, now);
    const state = loadSessionState(paths.stateDir, event.sessionId, now);
    saveSessionState(paths.stateDir, state);
    return { outcome: { type: 'none' }, state };
  }

  if (event.kind === 'session_end') {
    deleteSessionState(paths.stateDir, event.sessionId);
    return {
      outcome: { type: 'none' },
      state: loadSessionState(paths.stateDir, event.sessionId, now),
    };
  }

  const state = loadSessionState(paths.stateDir, event.sessionId, now);

  try {
    if (event.kind === 'user_input') {
      recordHumanInput(state, event.prompt, now);
      return { outcome: { type: 'none' }, state };
    }

    if (event.kind === 'turn_end') {
      state.turnCount += 1;
      return { outcome: { type: 'none' }, state };
    }

    if (event.kind === 'tool_end') {
      resolvePending(state, event.toolName, event.toolUseId, now);
      return { outcome: { type: 'none' }, state };
    }

    // tool_start: the main gate
    const signals = extractSignals(event.toolName, event.toolInput);
    for (const anchor of signals.anchors) {
      state.decisions.push({
        at: now,
        owner: 'agent',
        category: 'cli_infra',
        summary: `anchor ${anchor.kind}: ${anchor.detail}`.slice(0, 300),
      });
    }

    const { global, project } = await loadTrustWorld(paths);
    const resolveTrust = (introduction: EntityIntroduction) =>
      resolve(
        introduction.displayName,
        introduction.ecosystem,
        { session: state.temporaryTrust, project, global },
        now,
      );

    const outcome = evaluateIntroductions(signals.introductions, {
      state,
      config,
      resolveTrust,
      now,
      toolName: event.toolName,
      toolUseId: event.toolUseId,
    });
    return { outcome, state };
  } finally {
    saveSessionState(paths.stateDir, state);
  }
}

/**
 * A finished tool call resolves its pending crossing: the tool ran, so the
 * human (or the permission flow) allowed it. Absent events imply rejection —
 * the entity stays undecided and may legitimately be asked about again.
 */
function resolvePending(
  state: SessionState,
  toolName: string,
  toolUseId: string | undefined,
  now: number,
): void {
  const matches = state.pendingCrossings.filter(
    (p) =>
      (toolUseId && p.toolUseId && p.toolUseId === toolUseId) ||
      (!toolUseId && p.toolName === toolName && now - p.askedAt < 120_000),
  );
  if (matches.length === 0) return;
  markDecided(
    state,
    matches.map((m) => m.entityId),
    now,
  );
}
