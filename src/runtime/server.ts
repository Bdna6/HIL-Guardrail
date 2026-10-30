import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type NativeInput, RuntimeEngine } from './engine.js';
import { atomicJson, loadConfig, runtimeDir, validateConfig } from './store.js';

export async function serve(port = 4173) {
  const engine = new RuntimeEngine(loadConfig());
  const token = randomBytes(32).toString('hex'),
    cookie = randomBytes(32).toString('hex');
  const candidates = [
    fileURLToPath(new URL('../dashboard/', import.meta.url)),
    fileURLToPath(new URL('../../dashboard/', import.meta.url)),
  ];
  const assets = candidates.find((p) => existsSync(join(p, 'index.html')));
  if (!assets) throw new Error('Dashboard assets missing. Run npm run build.');
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  let hookQueue = Promise.resolve();
  async function body(req: IncomingMessage): Promise<unknown> {
    let text = '';
    for await (const chunk of req) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 1_000_000) throw new Error('Request too large');
    }
    return JSON.parse(text);
  }
  function json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  const server = createServer(async (req, res) => {
    const host = req.headers.host;
    if (!host || ![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(host)) {
      json(res, 403, { error: 'Invalid host' });
      return;
    }
    if (
      req.headers.origin &&
      ![`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`].includes(
        req.headers.origin,
      )
    ) {
      json(res, 403, { error: 'Cross-origin access denied' });
      return;
    }
    try {
      const pathname = new URL(req.url ?? '/', `http://${host}`).pathname;
      if (pathname.startsWith('/internal/')) {
        if (req.headers.authorization !== `Bearer ${token}`) {
          json(res, 401, { error: 'Unauthorized' });
          return;
        }
        if (pathname === '/internal/status' && req.method === 'GET') {
          json(res, 200, engine.status());
          return;
        }
        if (pathname === '/internal/shutdown' && req.method === 'POST') {
          json(res, 200, { stopping: true });
          setTimeout(() => server.close(), 50);
          return;
        }
        if (pathname === '/internal/hook' && req.method === 'POST') {
          const input = (await body(req)) as NativeInput;
          if (!input || typeof input !== 'object') {
            json(res, 400, { error: 'Invalid hook payload' });
            return;
          }
          let output = '';
          const task = hookQueue.then(async () => {
            output = await engine.handle(input);
          });
          hookQueue = task.catch(() => {});
          await task;
          json(res, 200, { stdout: output });
          return;
        }
        json(res, 404, { error: 'Unknown endpoint' });
        return;
      }
      if (pathname.startsWith('/api/local/')) {
        const cookies = req.headers.cookie?.split(';').map((v) => v.trim()) ?? [];
        if (!cookies.includes(`hil_local=${cookie}`)) {
          json(res, 401, { error: 'Open the local control page first' });
          return;
        }
        if (pathname === '/api/local/state' && req.method === 'GET') {
          json(res, 200, { config: engine.config, status: engine.status() });
          return;
        }
        if (pathname === '/api/local/config' && req.method === 'PUT') {
          if (!req.headers['content-type']?.startsWith('application/json')) {
            json(res, 415, { error: 'JSON required' });
            return;
          }
          const value = validateConfig(await body(req));
          if (value.revision !== engine.config.revision) {
            json(res, 409, {
              error: 'Configuration changed in another window. Reload before saving.',
            });
            return;
          }
          value.revision += 1;
          atomicJson(join(runtimeDir(), 'config.json'), value);
          engine.config = value;
          json(res, 200, { config: value, status: engine.status() });
          return;
        }
        json(res, 404, { error: 'Unknown endpoint' });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(res, 405, { error: 'Method not allowed' });
        return;
      }
      const routes = [
        '/',
        '/demo/dashboard',
        '/demo/settings',
        '/demo/usage',
        '/demo/open-source',
        '/local/dashboard',
        '/local/settings',
        '/local/usage',
        '/local/open-source',
      ];
      const normalized = pathname.replace(/\/$/, '') || '/';
      const file = resolve(
        assets,
        `.${routes.includes(normalized) ? '/index.html' : decodeURIComponent(pathname)}`,
      );
      if (!file.startsWith(assets.endsWith(sep) ? assets : assets + sep) || !types[extname(file)]) {
        json(res, 404, { error: 'Not found' });
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'text/plain',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
        ...(extname(file) === '.html'
          ? { 'Set-Cookie': `hil_local=${cookie}; HttpOnly; SameSite=Strict; Path=/` }
          : {}),
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });
  let actualPort = port;
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') actualPort = addr.port;
      done();
    });
  });
  const endpointFile = join(runtimeDir(), 'endpoint.json');
  atomicJson(endpointFile, { port: actualPort, token, pid: process.pid });
  server.on('close', () => {
    rmSync(endpointFile, { force: true });
  });
  const close = () => server.close();
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  console.log(`HIL local control: http://127.0.0.1:${actualPort}/local/dashboard`);
  return { server, engine, port: actualPort };
}
