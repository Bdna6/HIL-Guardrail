import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaths } from '../core/paths.js';

export const MODES = ['build', 'work', 'study'] as const;
export type Mode = (typeof MODES)[number];
export interface Policy {
  resources: boolean;
  scope: boolean;
  handover: boolean;
  summary: boolean;
  acknowledge: boolean;
  context: boolean;
}
export interface RuntimeConfig {
  revision: number;
  enabled: boolean;
  mode: Mode;
  policies: Record<Mode, Policy>;
  goal: string;
}
export interface Endpoint {
  port: number;
  token: string;
  pid: number;
}
export function runtimeDir(): string {
  return join(resolvePaths(process.cwd()).hilHome, 'runtime');
}
export function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}
export function atomicJson(file: string, value: unknown): void {
  mkdirSync(runtimeDir(), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}
export function defaults(): RuntimeConfig {
  return {
    revision: 1,
    enabled: true,
    mode: 'build',
    goal: '',
    policies: Object.fromEntries(
      MODES.map((m) => [
        m,
        {
          resources: true,
          scope: true,
          handover: true,
          summary: true,
          acknowledge: m !== 'build',
          context: true,
        },
      ]),
    ) as Record<Mode, Policy>,
  };
}
export function validateConfig(raw: unknown): RuntimeConfig {
  if (!raw || typeof raw !== 'object') throw new Error('Configuration must be an object');
  const value = raw as RuntimeConfig;
  if (
    !MODES.includes(value.mode) ||
    typeof value.enabled !== 'boolean' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.goal !== 'string' ||
    value.goal.length > 2000
  )
    throw new Error('Invalid mode, revision, enabled flag or goal');
  for (const mode of MODES)
    for (const key of [
      'resources',
      'scope',
      'handover',
      'summary',
      'acknowledge',
      'context',
    ] as const)
      if (typeof value.policies?.[mode]?.[key] !== 'boolean')
        throw new Error(`Invalid policy: ${mode}.${key}`);
  return {
    revision: value.revision,
    enabled: value.enabled,
    mode: value.mode,
    goal: value.goal,
    policies: Object.fromEntries(MODES.map((m) => [m, { ...value.policies[m] }])) as Record<
      Mode,
      Policy
    >,
  };
}
export function loadConfig(): RuntimeConfig {
  const file = join(runtimeDir(), 'config.json');
  const raw = readJson<unknown>(file);
  if (raw === undefined) {
    const value = defaults();
    atomicJson(file, value);
    return value;
  }
  return validateConfig(raw);
}
export function endpoint(): Endpoint | undefined {
  return readJson<Endpoint>(join(runtimeDir(), 'endpoint.json'));
}
