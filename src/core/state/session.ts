/**
 * Ephemeral session state (spec §22): one JSON file per session under
 * `~/.hil/state/`, deleted at SessionEnd and pruned by age as a safety net.
 * Nothing here is a behavioral record; nothing is aggregated across sessions.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Category } from '../trust/entities.js';
import type { SessionTrustGrant } from '../trust/resolve.js';

export interface HumanInputEvent {
  at: number;
  lengthClass: 'short' | 'medium' | 'long';
  lowInformation: boolean;
}

export interface DecisionRecord {
  at: number;
  owner: 'human' | 'agent';
  category: Category;
  entityId?: string;
  summary: string;
}

export interface PendingAsk {
  entityId: string;
  displayName: string;
  category: Category;
  toolName: string;
  toolUseId?: string;
  askedAt: number;
}

export interface InterventionRecord {
  at: number;
  level: 'informational' | 'attention' | 'high';
  category: Category;
  entityIds: string[];
}

export interface SessionState {
  taskId: string;
  createdAt: number;
  updatedAt: number;
  taskContext: string;
  humanInputs: HumanInputEvent[];
  decisions: DecisionRecord[];
  pendingCrossings: PendingAsk[];
  interventionHistory: InterventionRecord[];
  cooldowns: Partial<Record<Category, number>>;
  /** Entities the human already decided on this session (allow or reject). */
  decidedEntities: string[];
  muted: { session: boolean; categories: Category[] };
  temporaryTrust: SessionTrustGrant[];
  turnCount: number;
}

const LOW_INFORMATION =
  /^(ok|okay|k|yes|y|sure|go ahead|go on|continue|continue please|proceed|good|fine|looks good|looks good to me|lgtm|好的|好|嗯|嗯嗯|可以|继续|继续吧|看起来不错|没问题|行|同意|好的吧)\s*[.。!！~～]*$/iu;

export function isLowInformation(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length > 24) return false;
  return LOW_INFORMATION.test(trimmed);
}

export function newSessionState(taskId: string, now: number, taskContext = ''): SessionState {
  return {
    taskId,
    createdAt: now,
    updatedAt: now,
    taskContext,
    humanInputs: [],
    decisions: [],
    pendingCrossings: [],
    interventionHistory: [],
    cooldowns: {},
    decidedEntities: [],
    muted: { session: false, categories: [] },
    temporaryTrust: [],
    turnCount: 0,
  };
}

function stateFile(stateDir: string, taskId: string): string {
  // sanitize: task ids are uuids, but stay defensive
  const safe = taskId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(stateDir, `${safe}.json`);
}

export function loadSessionState(stateDir: string, taskId: string, now: number): SessionState {
  try {
    const raw = JSON.parse(readFileSync(stateFile(stateDir, taskId), 'utf8')) as SessionState;
    if (raw && typeof raw.taskId === 'string' && Array.isArray(raw.decisions)) {
      return { ...newSessionState(taskId, now), ...raw };
    }
  } catch {
    // missing/corrupt → fresh state (fail-open)
  }
  return newSessionState(taskId, now);
}

export function saveSessionState(stateDir: string, state: SessionState): void {
  mkdirSync(stateDir, { recursive: true });
  state.updatedAt = Date.now();
  writeFileSync(stateFile(stateDir, state.taskId), JSON.stringify(state, null, 2), 'utf8');
}

export function deleteSessionState(stateDir: string, taskId: string): void {
  rmSync(stateFile(stateDir, taskId), { force: true });
}

/** Safety-net pruning: session files are ephemeral; remove stragglers. */
export function pruneOldStates(stateDir: string, maxAgeMs: number, now: number): void {
  if (!existsSync(stateDir)) return;
  for (const entry of readdirSync(stateDir)) {
    if (!entry.endsWith('.json')) continue;
    const file = join(stateDir, entry);
    try {
      if (now - statSync(file).mtimeMs > maxAgeMs) rmSync(file, { force: true });
    } catch {
      // raced or unreadable → ignore
    }
  }
}

/**
 * Uninstall path: drop every session file. State is derived, ephemeral data
 * (taskContext snippets, decision flow) — removing it must never lose user
 * config; the 48h prune remains the safety net for files left locked.
 */
export function clearAllSessionStates(stateDir: string): number {
  if (!existsSync(stateDir)) return 0;
  let removed = 0;
  for (const entry of readdirSync(stateDir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      rmSync(join(stateDir, entry), { force: true });
      removed += 1;
    } catch {
      // locked/unreadable → leave it for the age-based prune
    }
  }
  return removed;
}

export function recordHumanInput(state: SessionState, prompt: string, now: number): void {
  const lowInformation = isLowInformation(prompt);
  state.humanInputs.push({
    at: now,
    lengthClass: prompt.length < 24 ? 'short' : prompt.length < 200 ? 'medium' : 'long',
    lowInformation,
  });
  // the first substantive input defines the task context ("ok" does not)
  if (!state.taskContext && prompt.trim() && !lowInformation) {
    state.taskContext = prompt.trim().slice(0, 400);
  }
}

export function isCategoryInCooldown(
  state: SessionState,
  category: Category,
  now: number,
): boolean {
  const until = state.cooldowns[category];
  return typeof until === 'number' && until > now;
}

export function setCooldown(state: SessionState, category: Category, untilMs: number): void {
  state.cooldowns[category] = untilMs;
}

export function hasDecided(state: SessionState, entityId: string): boolean {
  return state.decidedEntities.includes(entityId);
}

export function markDecided(state: SessionState, entityIds: string[], now: number): void {
  for (const id of entityIds) {
    if (!state.decidedEntities.includes(id)) state.decidedEntities.push(id);
  }
  state.pendingCrossings = state.pendingCrossings.filter((p) => !entityIds.includes(p.entityId));
  state.decisions.push({
    at: now,
    owner: 'human',
    category: 'library',
    summary: `human decided: ${entityIds.join(', ')}`,
  });
}
