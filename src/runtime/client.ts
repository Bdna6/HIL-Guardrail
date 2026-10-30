import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { version } from '../index.js';
import { endpoint, runtimeDir } from './store.js';

export async function runtimeRequest(
  path: string,
  body?: unknown,
  timeout = 2500,
): Promise<unknown> {
  const target = endpoint();
  if (!target) throw new Error('HIL background service is not running. Run hil start.');
  const response = await fetch(`http://127.0.0.1:${target.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`HIL service returned ${response.status}`);
  return response.json();
}
export async function forwardHook(raw: string): Promise<string | undefined> {
  if (!endpoint()) {
    if (!existsSync(join(runtimeDir(), 'config.json'))) return undefined;
    const input = JSON.parse(raw) as { hook_event_name?: string };
    if (input.hook_event_name === 'SessionStart' || input.hook_event_name === 'UserPromptSubmit')
      return JSON.stringify({
        systemMessage: 'HIL background service is stopped.',
        hookSpecificOutput: {
          hookEventName: input.hook_event_name,
          additionalContext: `HIL runtime facts: ${JSON.stringify({ running: false, enabled: false, mode: null, version })}. Report this if asked; do not claim HIL is enforcing rules. Run hil start to reconnect.`,
        },
      });
    return '';
  }
  try {
    return ((await runtimeRequest('/internal/hook', JSON.parse(raw), 18_000)) as { stdout: string })
      .stdout;
  } catch {
    const input = JSON.parse(raw) as { hook_event_name?: string };
    const text = `HIL runtime facts: running=false, enabled=false, mode=unknown, version=${version}. 后台无法连接；不能视为启用。请运行 hil runtime status。`;
    return JSON.stringify({
      systemMessage: text,
      ...(['SessionStart', 'UserPromptSubmit'].includes(input.hook_event_name ?? '')
        ? { hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: text } }
        : {}),
    });
  }
}
