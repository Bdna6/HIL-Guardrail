import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { assess } from '../../src/runtime/semantic';

afterEach(() => vi.unstubAllEnvs());
it('inherits Anthropic settings, removes CLI context suffix, uses /v1/messages and parses direct responses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hil-semantic-config-'));
  mkdirSync(join(dir, 'config'));
  const seen: Array<{ url: string; model: string; content: string }> = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    const value = JSON.parse(body);
    seen.push({ url: req.url ?? '', model: value.model, content: JSON.stringify(value.messages) });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              scopeExpanded: true,
              understood: false,
              question: 'Keep it local?',
              reason: 'Cloud storage exceeds scope.',
            }),
          },
        ],
      }),
    );
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing address');
    for (const key of ['HIL_MODEL_BASE_URL', 'HIL_MODEL_API_KEY', 'HIL_MODEL']) vi.stubEnv(key, '');
    vi.stubEnv('HIL_SEMANTIC_SOURCE', 'claude');
    vi.stubEnv('HIL_MODEL_DIRECT', '1');
    vi.stubEnv('CLAUDE_CONFIG_DIR', join(dir, 'config'));
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://127.0.0.1:1/unrelated');
    writeFileSync(
      join(dir, 'config', 'settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}/anthropic`,
          ANTHROPIC_AUTH_TOKEN: 'fixture-key',
          ANTHROPIC_MODEL: 'fixture-model[1m]',
        },
      }),
    );
    const result = await assess({
      purpose: 'scope',
      password: 'fixture-secret',
      evidence: 'api_key=another-secret',
    });
    expect(result?.scopeExpanded).toBe(true);
    expect(seen[0]?.url).toBe('/anthropic/v1/messages');
    expect(seen[0]?.model).toBe('fixture-model');
    expect(seen[0]?.content).not.toContain('fixture-secret');
    expect(seen[0]?.content).not.toContain('another-secret');
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
