/**
 * Claude Code hook input → CoreEvent. Only the events HIL subscribes to are
 * mapped (docs/04 §2); everything else returns null (observed, ignored).
 */
import type { CoreEvent } from '../../core/events/types.js';

interface HookInput {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  permission_mode?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  tool_response?: unknown;
  prompt?: string;
}

export function parseHookInput(raw: string): HookInput | null {
  try {
    const parsed = JSON.parse(raw) as HookInput;
    if (parsed && typeof parsed === 'object' && typeof parsed.hook_event_name === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function toCoreEvent(input: HookInput, now: number): CoreEvent | null {
  const sessionId = typeof input.session_id === 'string' ? input.session_id : 'unknown-session';
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();

  switch (input.hook_event_name) {
    case 'SessionStart':
      return { kind: 'session_start', sessionId, cwd, at: now };
    case 'SessionEnd':
      return { kind: 'session_end', sessionId, at: now };
    case 'UserPromptSubmit':
      return {
        kind: 'user_input',
        sessionId,
        prompt: typeof input.prompt === 'string' ? input.prompt : '',
        at: now,
      };
    case 'PreToolUse':
      if (typeof input.tool_name !== 'string') return null;
      return {
        kind: 'tool_start',
        sessionId,
        toolName: input.tool_name,
        toolInput: input.tool_input ?? {},
        toolUseId: input.tool_use_id,
        at: now,
      };
    case 'PostToolUse':
      if (typeof input.tool_name !== 'string') return null;
      return {
        kind: 'tool_end',
        sessionId,
        toolName: input.tool_name,
        toolInput: input.tool_input ?? {},
        toolResponse: input.tool_response,
        toolUseId: input.tool_use_id,
        at: now,
      };
    case 'Stop':
      return { kind: 'turn_end', sessionId, at: now };
    default:
      return null;
  }
}
