/**
 * `hil install` / `hil uninstall` for Claude Code: idempotently merge HIL hook
 * entries into settings.json and drop the `/hil` command file. Only entries
 * marked with `--from-hil` are ever touched — everything else in the user's
 * settings is preserved byte-for-byte (other keys) or object-for-object.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths } from '../../core/paths.js';

export type InstallScope = 'user' | 'project' | 'local';

const HIL_MARKER = '--from-hil';

/** Tool matchers for the events HIL subscribes to (docs/04 §2). */
const HOOK_MATCHERS: Record<string, string | undefined> = {
  PreToolUse: 'Bash|PowerShell|Write|Edit|MultiEdit|mcp__.*',
  PostToolUse: 'Bash|PowerShell|Write|Edit|MultiEdit|mcp__.*',
  UserPromptSubmit: undefined,
  SessionStart: undefined,
  SessionEnd: undefined,
  Stop: undefined,
};

export function hookCommand(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/adapters/claude-code/install.js → dist/interface/cli/main.js
  const cli = join(here, '..', '..', 'interface', 'cli', 'main.js');
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} hook ${HIL_MARKER} --hil-home ${JSON.stringify(resolvePaths(process.cwd()).hilHome)}`;
}

interface HookGroup {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; [key: string]: unknown }>;
}

type SettingsShape = {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
};

export function settingsFileFor(scope: InstallScope, projectDir: string): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  if (scope === 'user') return join(configDir, 'settings.json');
  if (scope === 'local') return join(projectDir, '.claude', 'settings.local.json');
  return join(projectDir, '.claude', 'settings.json');
}

export function commandDirFor(scope: InstallScope, projectDir: string): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  return scope === 'user' ? join(configDir, 'commands') : join(projectDir, '.claude', 'commands');
}

function readSettings(file: string): SettingsShape {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SettingsShape;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error(`Cannot read settings safely: ${file}. Fix the JSON before installing HIL.`);
  }
}

function isOurs(group: HookGroup): boolean {
  return (group.hooks ?? []).some(
    (hook) => typeof hook.command === 'string' && hook.command.includes(HIL_MARKER),
  );
}

export function installHooks(
  scope: InstallScope,
  projectDir: string,
): { settings: string; command: string } {
  const settingsFile = settingsFileFor(scope, projectDir);
  const settings = readSettings(settingsFile);
  settings.hooks ??= {};

  const command = hookCommand();
  for (const [event, matcher] of Object.entries(HOOK_MATCHERS)) {
    const existing = (settings.hooks[event] ?? []).filter((group) => !isOurs(group));
    const ours: HookGroup = {
      ...(matcher ? { matcher } : {}),
      hooks: [{ type: 'command', command, timeout: 20 }],
    };
    settings.hooks[event] = [...existing, ours];
  }

  mkdirSync(dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');

  const commandDir = commandDirFor(scope, projectDir);
  const commandFile = join(commandDir, 'hil.md');
  mkdirSync(commandDir, { recursive: true });
  const executable = hookCommand().replace(` hook ${HIL_MARKER}`, '');
  writeFileSync(
    commandFile,
    HIL_COMMAND_MD.replace('hil $ARGUMENTS', `${executable} $ARGUMENTS`).replace(
      'Bash(hil *)',
      'Bash',
    ),
    'utf8',
  );

  return { settings: settingsFile, command: commandFile };
}

export function uninstallHooks(
  scope: InstallScope,
  projectDir: string,
): { settings: string; removed: boolean } {
  const settingsFile = settingsFileFor(scope, projectDir);
  if (!existsSync(settingsFile)) return { settings: settingsFile, removed: false };
  const settings = readSettings(settingsFile);
  if (!settings.hooks) return { settings: settingsFile, removed: false };

  let removed = false;
  for (const event of Object.keys(settings.hooks)) {
    const groups = settings.hooks[event] ?? [];
    const kept = groups.filter((group) => {
      if (isOurs(group)) {
        removed = true;
        return false;
      }
      return true;
    });
    if (kept.length > 0) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');

  const commandFile = join(commandDirFor(scope, projectDir), 'hil.md');
  if (existsSync(commandFile)) {
    rmSync(commandFile, { force: true });
  }
  return { settings: settingsFile, removed };
}

export const HIL_COMMAND_MD = `---
description: HIL — trust boundary management (status, trust add/remove, mute)
argument-hint: status | trust list | trust add <name> | trust remove <name> | review | mute | resume
disable-model-invocation: true
allowed-tools: Bash(hil *)
---
!\`hil $ARGUMENTS\`
`;
