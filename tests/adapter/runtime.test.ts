import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleHook } from '../../src/adapters/claude-code/index';
import { installHooks } from '../../src/adapters/claude-code/install';
import { serve } from '../../src/runtime/server';
import { endpoint, type RuntimeConfig } from '../../src/runtime/store';

let home: string, project: string, originalHome: string | undefined;
let runtime: Awaited<ReturnType<typeof serve>> | undefined;
let cookie: string, origin: string;
const semanticKeys = [
  'HIL_MODEL_BASE_URL',
  'HIL_MODEL_API_KEY',
  'HIL_MODEL',
  'HIL_SEMANTIC_SOURCE',
  'HIL_MODEL_DIRECT',
] as const;
let savedSemantic: Record<string, string | undefined>;
let provider: Server | undefined;
beforeEach(async () => {
  savedSemantic = Object.fromEntries(semanticKeys.map((key) => [key, process.env[key]]));
  for (const key of semanticKeys) delete process.env[key];
  originalHome = process.env.HIL_HOME;
  home = mkdtempSync(join(tmpdir(), 'hil-runtime-'));
  project = mkdtempSync(join(tmpdir(), 'hil-project-'));
  process.env.HIL_HOME = home;
  runtime = await serve(0);
  origin = `http://127.0.0.1:${runtime.port}`;
  const page = await fetch(`${origin}/local/dashboard`);
  cookie = page.headers.get('set-cookie')?.split(';')[0] ?? '';
  await page.text();
});
afterEach(async () => {
  if (provider) {
    await new Promise<void>((resolve) => {
      provider?.close(() => resolve());
      provider?.closeAllConnections();
    });
    provider = undefined;
  }
  for (const key of semanticKeys) {
    if (savedSemantic[key] === undefined) delete process.env[key];
    else process.env[key] = savedSemantic[key];
  }
  if (runtime) {
    await new Promise<void>((resolve) => {
      runtime?.server.close(() => resolve());
      runtime?.server.closeAllConnections();
    });
    runtime = undefined;
  }
  if (originalHome === undefined) delete process.env.HIL_HOME;
  else process.env.HIL_HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});
async function state() {
  return (
    await fetch(`${origin}/api/local/state`, { headers: { Cookie: cookie } })
  ).json() as Promise<{
    config: RuntimeConfig;
    status: { version: string; mode: string; enabled: boolean; sessions: unknown[] };
  }>;
}
async function save(config: RuntimeConfig) {
  return fetch(`${origin}/api/local/config`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(config),
  });
}
async function hook(event: string, extra: Record<string, unknown> = {}) {
  return handleHook(
    JSON.stringify({ session_id: 'real-pipeline', cwd: project, hook_event_name: event, ...extra }),
  );
}
describe('local runtime, browser config and real hook entrypoint', () => {
  it('keeps routine testing quiet and prevents a denied resource retry without human input', async () => {
    await hook('UserPromptSubmit', { prompt: 'Fix a local application test.' });
    await hook('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
    expect((await hook('Stop')).stdout).toBe('');
    const tool = {
      tool_name: 'Bash',
      tool_input: { command: 'npm install supabase' },
      permission_mode: 'bypassPermissions',
    };
    expect(
      JSON.parse((await hook('PreToolUse', tool)).stdout).hookSpecificOutput.permissionDecision,
    ).toBe('deny');
    expect(
      JSON.parse((await hook('PreToolUse', tool)).stdout).hookSpecificOutput.permissionDecision,
    ).toBe('deny');
  });
  it('uses a configured compatible evaluator for scope and preserves pending checks on insufficient answers', async () => {
    let accepted = false;
    const requests: string[] = [];
    provider = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk.toString();
      requests.push(body);
      const evidence = JSON.parse(JSON.parse(body).messages[1].content);
      const result = {
        scopeExpanded: evidence.purpose === 'scope',
        understood: accepted,
        question: 'Why must this local-only app use a cloud database?',
        reason: 'The task requested local-only storage.',
      };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
    });
    await new Promise<void>((resolve) => provider?.listen(0, '127.0.0.1', resolve));
    const addr = provider.address();
    if (!addr || typeof addr === 'string') throw new Error('No provider port');
    process.env.HIL_MODEL_BASE_URL = `http://127.0.0.1:${addr.port}/v1`;
    process.env.HIL_MODEL_API_KEY = 'test-only';
    process.env.HIL_MODEL = 'fake-evaluator';
    await hook('UserPromptSubmit', { prompt: 'Build a local-only reading list.' });
    const tool = {
      tool_name: 'Write',
      tool_input: {
        file_path: join(project, 'app.js'),
        content: 'api_key=fixture-secret; connectToCloud();',
      },
    };
    expect(
      JSON.parse((await hook('PreToolUse', tool)).stdout).hookSpecificOutput.permissionDecision,
    ).toBe('deny');
    expect(requests.join('')).not.toContain('fixture-secret');
    await hook('UserPromptSubmit', { prompt: 'I am not certain why this requires cloud storage.' });
    expect(
      JSON.parse((await hook('PreToolUse', tool)).stdout).hookSpecificOutput.permissionDecision,
    ).toBe('deny');
    accepted = true;
    await hook('UserPromptSubmit', {
      prompt:
        'I explicitly choose cloud sync across devices and accept the external data storage and account requirements.',
    });
    expect(JSON.stringify((await state()).status.sessions)).toContain('model-reviewed');
    expect((await hook('PreToolUse', tool)).stdout).toBe('');
  });
  it('serves live and demo routes without leaking endpoint credentials', async () => {
    for (const path of ['/local/settings', '/demo/dashboard', '/local.js']) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(200);
      await response.text();
    }
    expect((await fetch(`${origin}/api/local/state`)).status).toBe(401);
    const response = await fetch(`${origin}/api/local/state`, { headers: { Cookie: cookie } });
    const text = await response.text();
    expect(text).not.toContain(endpoint()?.token);
    expect(text).toContain('0.2.0');
  });
  it('rejects foreign origins, invalid configs and stale revisions', async () => {
    const current = await state();
    expect(
      (
        await fetch(`${origin}/api/local/config`, {
          method: 'PUT',
          headers: {
            Cookie: cookie,
            Origin: 'https://foreign.test',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(current.config),
        })
      ).status,
    ).toBe(403);
    expect(
      (await save({ ...current.config, mode: 'bogus' } as unknown as RuntimeConfig)).status,
    ).toBe(400);
    expect((await save(current.config)).status).toBe(200);
    expect((await save(current.config)).status).toBe(409);
  });
  it('injects authoritative enabled/mode/version and applies web changes on the next prompt', async () => {
    expect(
      JSON.parse((await hook('SessionStart')).stdout).hookSpecificOutput.additionalContext,
    ).toContain('"version":"0.2.0"');
    const current = await state();
    await save({ ...current.config, mode: 'study' });
    const output = JSON.parse(
      (await hook('UserPromptSubmit', { prompt: 'HIL 当前是什么模式和版本？' })).stdout,
    );
    expect(output.hookSpecificOutput.additionalContext).toContain('"mode":"study"');
    const next = await state();
    await save({ ...next.config, enabled: false });
    expect(
      JSON.parse((await hook('UserPromptSubmit', { prompt: 'HIL 是否启动？' })).stdout)
        .hookSpecificOutput.additionalContext,
    ).toContain('"enabled":false');
    expect(
      (
        await hook('PreToolUse', {
          tool_name: 'Bash',
          tool_input: { command: 'npm install supabase' },
          permission_mode: 'default',
        })
      ).stdout,
    ).toBe('');
  });
  it('study gates an actual write, keeps low-information responses pending, and distinguishes authorization from understanding', async () => {
    const current = await state();
    await save({ ...current.config, mode: 'study' });
    await hook('UserPromptSubmit', {
      prompt: 'Teach me to build a local reading list application.',
    });
    const tool = {
      tool_name: 'Write',
      tool_input: { file_path: join(project, 'app.js'), content: 'export const app = true;' },
      tool_use_id: 'write1',
      permission_mode: 'default',
    };
    expect(
      JSON.parse((await hook('PreToolUse', tool)).stdout).hookSpecificOutput.permissionDecision,
    ).toBe('deny');
    await hook('UserPromptSubmit', { prompt: 'ok' });
    expect(
      JSON.parse((await hook('PreToolUse', tool)).stdout).hookSpecificOutput.permissionDecision,
    ).toBe('deny');
    await hook('UserPromptSubmit', {
      prompt:
        'I will store a list in local storage and verify it persists by reloading the browser.',
    });
    expect((await hook('PreToolUse', tool)).stdout).toBe('');
    expect(JSON.stringify((await state()).status.sessions)).toContain('user-responded-unverified');
    await hook('PostToolUse', tool);
    expect(JSON.parse((await hook('Stop')).stdout).decision).toBe('block');
    expect((await hook('Stop', { stop_hook_active: true })).stdout).toBe('');
  });
  it('preserves other hooks and model settings and refuses malformed settings', () => {
    const dir = join(project, '.claude');
    installHooks('project', project);
    const file = join(dir, 'settings.json');
    const settings = JSON.parse(readFileSync(file, 'utf8'));
    settings.env = { ANTHROPIC_BASE_URL: 'https://example.invalid' };
    settings.hooks.PreToolUse.push({ hooks: [{ type: 'command', command: 'other-hook' }] });
    writeFileSync(file, JSON.stringify(settings));
    installHooks('project', project);
    const result = JSON.parse(readFileSync(file, 'utf8'));
    expect(result.env).toEqual(settings.env);
    expect(result.hooks.PreToolUse).toHaveLength(2);
    writeFileSync(file, '{broken');
    expect(() => installHooks('project', project)).toThrow('Fix the JSON');
    expect(readFileSync(file, 'utf8')).toBe('{broken');
  });
  it('reports stopped state and disables runtime interventions after clean shutdown', async () => {
    await hook('SessionStart');
    await new Promise<void>((resolve) => {
      runtime?.server.close(() => resolve());
      runtime?.server.closeAllConnections();
    });
    runtime = undefined;
    expect(
      JSON.parse((await hook('UserPromptSubmit', { prompt: 'HIL status?' })).stdout)
        .hookSpecificOutput.additionalContext,
    ).toContain('"running":false');
    expect(
      (
        await hook('PreToolUse', {
          tool_name: 'Bash',
          tool_input: { command: 'npm install supabase' },
        })
      ).stdout,
    ).toBe('');
  });
});
