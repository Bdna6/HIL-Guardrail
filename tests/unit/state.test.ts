import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllSessionStates,
  deleteSessionState,
  loadSessionState,
  markDecided,
  newSessionState,
  pruneOldStates,
  saveSessionState,
} from '../../src/core/state/session';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hil-state-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('session state lifecycle', () => {
  it('round-trips through disk', () => {
    const state = newSessionState('abc', 100);
    state.decisions.push({ at: 100, owner: 'agent', category: 'library', summary: 'x' });
    saveSessionState(dir, state);
    const loaded = loadSessionState(dir, 'abc', 200);
    expect(loaded.decisions).toHaveLength(1);
    expect(loaded.createdAt).toBe(100);
  });

  it('corrupt state fails open to a fresh session', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'zzz.json'), '{not json', 'utf8');
    const loaded = loadSessionState(dir, 'zzz', 1);
    expect(loaded.decisions).toEqual([]);
  });

  it('delete removes exactly the session file', () => {
    saveSessionState(dir, newSessionState('a', 1));
    saveSessionState(dir, newSessionState('b', 1));
    deleteSessionState(dir, 'a');
    expect(existsSync(join(dir, 'a.json'))).toBe(false);
    expect(existsSync(join(dir, 'b.json'))).toBe(true);
  });

  it('prunes stale files but keeps fresh ones', async () => {
    // Windows forbids utimes before birth time, so age by real clock instead
    const staleFile = join(dir, 'stale.json');
    writeFileSync(staleFile, '{}', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 250));
    saveSessionState(dir, newSessionState('fresh', 1));
    pruneOldStates(dir, 50, Date.now());
    expect(existsSync(staleFile)).toBe(false);
    expect(readdirSync(dir)).toContain('fresh.json');
  });

  it('clearAllSessionStates removes every session file and reports the count', () => {
    saveSessionState(dir, newSessionState('a', 1));
    saveSessionState(dir, newSessionState('b', 1));
    const removed = clearAllSessionStates(dir);
    expect(removed).toBe(2);
    expect(readdirSync(dir)).toHaveLength(0);
    // idempotent: nothing left to remove, missing dir is fine too
    expect(clearAllSessionStates(dir)).toBe(0);
    expect(clearAllSessionStates(`${dir}-missing`)).toBe(0);
  });

  it('markDecided resolves pending crossings', () => {
    const state = newSessionState('s', 1);
    state.pendingCrossings.push({
      entityId: 'svc:x',
      displayName: 'X',
      category: 'library',
      toolName: 'Bash',
      askedAt: 1,
    });
    markDecided(state, ['svc:x'], 2);
    expect(state.decidedEntities).toContain('svc:x');
    expect(state.pendingCrossings).toHaveLength(0);
    expect(state.decisions.some((d) => d.owner === 'human')).toBe(true);
  });
});
