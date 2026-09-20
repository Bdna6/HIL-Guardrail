import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleHook } from '../../src/adapters/claude-code';

let home: string;
let project: string;
let savedHome: string | undefined;

beforeEach(() => {
  savedHome = process.env.HIL_HOME;
  home = mkdtempSync(join(tmpdir(), 'hil-golden-home-'));
  project = mkdtempSync(join(tmpdir(), 'hil-golden-proj-'));
  process.env.HIL_HOME = home;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.HIL_HOME;
  else process.env.HIL_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

interface DecisionShape {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: string;
    permissionDecisionReason: string;
  };
}

describe('adapter golden contract (stdin JSON → stdout JSON)', () => {
  it('routine Bash work produces no output', async () => {
    await handleHook(hookJson('SessionStart', {}));
    const { stdout } = await handleHook(
      hookJson('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } }),
    );
    expect(stdout).toBe('');
  });

  it('prompting mode: trust crossing produces the exact ask decision shape', async () => {
    await handleHook(hookJson('SessionStart', {}));
    const { stdout } = await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'npm install supabase' },
        tool_use_id: 't1',
        permission_mode: 'default',
      }),
    );
    const parsed = JSON.parse(stdout) as DecisionShape;
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('Supabase');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
      'hil trust add svc:supabase',
    );
  });

  it('non-prompting mode: degrades to deny + conversational reason (docs/05 mapping)', async () => {
    await handleHook(hookJson('SessionStart', {}));
    const { stdout } = await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'npm install supabase' },
        tool_use_id: 't1',
        permission_mode: 'bypassPermissions',
      }),
    );
    const parsed = JSON.parse(stdout) as DecisionShape;
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('Supabase');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('ask the user');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
      'hil trust add svc:supabase',
    );
  });

  it('dontAsk mode also degrades to deny', async () => {
    await handleHook(hookJson('SessionStart', {}));
    const { stdout } = await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'docker pull redis' },
        permission_mode: 'dontAsk',
      }),
    );
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('missing permission mode degrades to deny (the only reliable channel)', async () => {
    await handleHook(hookJson('SessionStart', {}));
    const { stdout } = await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'pip install pymongo' },
      }),
    );
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('auto mode still prompts (documented ask behavior)', async () => {
    await handleHook(hookJson('SessionStart', {}));
    const { stdout } = await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'pip install pymongo' },
        permission_mode: 'auto',
      }),
    );
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('PostToolUse resolves the pending ask; repeat stays silent', async () => {
    await handleHook(hookJson('SessionStart', {}));
    await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'npm install supabase' },
        tool_use_id: 't1',
        permission_mode: 'default',
      }),
    );
    const resolved = await handleHook(
      hookJson('PostToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'npm install supabase' },
        tool_use_id: 't1',
      }),
    );
    expect(resolved.stdout).toBe('');
    const again = await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'npm install supabase' },
        tool_use_id: 't2',
        permission_mode: 'default',
      }),
    );
    expect(again.stdout).toBe('');
  });

  it('malformed input fails open with empty output', async () => {
    const { stdout } = await handleHook('{not json');
    expect(stdout).toBe('');
  });

  it('unsubscribed events are ignored', async () => {
    const { stdout } = await handleHook(hookJson('Notification', { message: 'x' }));
    expect(stdout).toBe('');
  });

  it('zh-CN renders the localized ask and deny alerts', async () => {
    const saved = process.env.HIL_LANG;
    process.env.HIL_LANG = 'zh-CN';
    try {
      await handleHook(hookJson('SessionStart', {}));
      const ask = await handleHook(
        hookJson('PreToolUse', {
          tool_name: 'Bash',
          tool_input: { command: 'pip install pymongo' },
          permission_mode: 'default',
        }),
      );
      expect(ask.stdout).toContain('信任边界提醒');
      expect(ask.stdout).toContain('MongoDB');

      const denied = await handleHook(
        hookJson('PreToolUse', {
          tool_name: 'Bash',
          tool_input: { command: 'npm install supabase' },
          permission_mode: 'bypassPermissions',
        }),
      );
      expect(denied.stdout).toContain('决策待定');
      expect(denied.stdout).toContain('请先询问用户');
    } finally {
      if (saved === undefined) delete process.env.HIL_LANG;
      else process.env.HIL_LANG = saved;
    }
  });

  it('session end cleans up ephemeral state', async () => {
    await handleHook(hookJson('SessionStart', {}));
    await handleHook(
      hookJson('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'npm install supabase' },
        permission_mode: 'default',
      }),
    );
    await handleHook(hookJson('SessionEnd', {}));
    const { readdirSync, existsSync } = await import('node:fs');
    const stateDir = join(home, 'state');
    expect(existsSync(stateDir) ? readdirSync(stateDir).length : 0).toBe(0);
  });
});

function hookJson(event: string, extra: Record<string, unknown>): string {
  return JSON.stringify({ hook_event_name: event, session_id: 'golden-1', cwd: project, ...extra });
}
