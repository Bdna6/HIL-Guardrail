import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeRequest } from './client.js';
import { runtimeDir } from './store.js';

export async function start(port: number): Promise<void> {
  try {
    const status = await runtimeRequest('/internal/status');
    console.log(JSON.stringify(status, null, 2));
    return;
  } catch {
    /* No healthy service. */
  }
  mkdirSync(runtimeDir(), { recursive: true });
  const log = openSync(join(runtimeDir(), 'service.log'), 'a', 0o600);
  const cli = fileURLToPath(new URL('../interface/cli/main.js', import.meta.url));
  const child = spawn(process.execPath, [cli, 'serve', '--port', String(port)], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: process.env,
  });
  let failure: Error | undefined;
  child.once('error', (error) => {
    failure = error;
  });
  child.unref();
  closeSync(log);
  for (let i = 0; i < 40; i++) {
    if (failure) throw failure;
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const status = await runtimeRequest('/internal/status');
      console.log(`HIL started. http://127.0.0.1:${port}/local/dashboard`);
      console.log(JSON.stringify(status, null, 2));
      return;
    } catch {
      /* Wait for readiness. */
    }
  }
  throw new Error(
    `HIL did not start. Check ${join(runtimeDir(), 'service.log')} (port may be occupied).`,
  );
}
