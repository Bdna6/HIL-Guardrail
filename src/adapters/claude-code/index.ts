/**
 * Hook entrypoint: stdin JSON → CoreEvent → engine → stdout JSON.
 * Fail-open by contract: any error returns '' (Claude Code proceeds normally).
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Lang } from '../../core/config.js';
import { normalizeLang } from '../../core/config.js';
import { processEvent } from '../../core/engine.js';
import { resolvePaths } from '../../core/paths.js';
import { configFromCache, readConfigCache } from '../../core/trust/store.js';
import { parseHookInput, toCoreEvent } from './parse.js';
import { renderHookOutput } from './render.js';

export interface HookOutcome {
  stdout: string;
  lang: Lang;
}

function trace(paths: { hilHome: string }, line: string): void {
  if (process.env.HIL_TRACE !== '1') return;
  try {
    mkdirSync(dirname(paths.hilHome), { recursive: true });
    appendFileSync(`${paths.hilHome}/trace.log`, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch {
    // tracing must never break the hook
  }
}

export async function handleHook(
  rawStdin: string,
  options: { skipRuntime?: boolean; suppressInterventions?: boolean } = {},
): Promise<HookOutcome> {
  try {
    if (!options.skipRuntime) {
      const { forwardHook } = await import('../../runtime/client.js');
      const forwarded = await forwardHook(rawStdin);
      if (forwarded !== undefined)
        return { stdout: forwarded, lang: normalizeLang(process.env.HIL_LANG) };
    }
    const input = parseHookInput(rawStdin);
    if (!input) return { stdout: '', lang: 'en' };
    const event = toCoreEvent(input, Date.now());
    if (!event) return { stdout: '', lang: 'en' };

    const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd();
    const paths = resolvePaths(cwd);
    const config = configFromCache(readConfigCache(paths.globalConfigCache), process.env.HIL_LANG);
    if (options.suppressInterventions) config.mutedAll = true;
    const lang = normalizeLang(process.env.HIL_LANG ?? config.language);

    trace(
      paths,
      `${input.hook_event_name} session=${input.session_id} tool=${input.tool_name ?? ''}`,
    );

    const result = await processEvent(event, { paths, config, now: Date.now });
    const stdout = renderHookOutput(
      input.hook_event_name ?? '',
      result.outcome,
      lang,
      input.permission_mode,
    );

    if (result.outcome.type === 'ask') {
      trace(paths, `ASK ${result.outcome.askables.map((a) => a.introduction.entityId).join(',')}`);
    }
    return { stdout, lang };
  } catch (error) {
    // fail-open: never let HIL break the session
    try {
      const paths = resolvePaths(process.cwd());
      trace(paths, `ERROR ${(error as Error).message}`);
    } catch {
      // ignore
    }
    return { stdout: '', lang: 'en' };
  }
}
