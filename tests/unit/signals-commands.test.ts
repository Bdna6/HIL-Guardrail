import { describe, expect, it } from 'vitest';
import {
  extractFromCommand,
  programOf,
  splitSegments,
  tokenize,
} from '../../src/core/signals/commands';
import { extractSignals } from '../../src/core/signals/index';

const ids = (command: string) => extractFromCommand(command).map((i) => i.entityId);

describe('command signal extraction', () => {
  it('npm family installs', () => {
    expect(ids('npm install supabase')).toEqual(['svc:supabase']);
    expect(ids('npm i -D vitest')).toEqual(['npm:vitest']);
    expect(ids('npm install @supabase/supabase-js')).toEqual(['svc:supabase']);
    expect(ids('pnpm add drizzle-orm')).toEqual(['svc:drizzle']);
    expect(ids('yarn add left-pad')).toEqual(['npm:left-pad']);
    expect(ids('bun add hono')).toEqual(['npm:hono']);
  });

  it('bare npm install (all from manifest) is not an introduction', () => {
    expect(ids('npm install')).toEqual([]);
  });

  it('python family installs', () => {
    expect(ids('pip install pymongo')).toEqual(['svc:mongodb']);
    expect(ids('pip3 install --upgrade fastapi')).toEqual(['svc:fastapi']);
    expect(ids('python -m pip install requests')).toEqual(['pypi:requests']);
    expect(ids('python3 -m pip install boto3')).toEqual(['svc:aws']);
    expect(ids('pip install -r requirements.txt')).toEqual([]);
    expect(ids('pip install -e .')).toEqual([]);
    expect(ids('uv add httpx')).toEqual(['pypi:httpx']);
    expect(ids('uv pip install flask')).toEqual(['svc:flask']);
    expect(ids('poetry add rich')).toEqual(['pypi:rich']);
  });

  it('other ecosystems', () => {
    expect(ids('cargo add serde')).toEqual(['cargo:serde']);
    expect(ids('go get github.com/gin-gonic/gin')).toEqual(['go:gin-gonic/gin']);
    expect(ids('docker pull redis:7-alpine')).toEqual(['svc:redis']);
    expect(ids('docker pull postgres')).toEqual(['svc:postgresql']);
    expect(ids('docker pull ghcr.io/someorg/someapp:latest')).toEqual(['docker:someapp']);
  });

  it('runners: only create-* generators introduce (routine npx stays silent)', () => {
    expect(ids('npx create-next-app@latest myapp')).toEqual(['npm:create-next-app']);
    expect(ids('bunx cowsay')).toEqual([]);
    expect(ids('npx vitest run tests/unit')).toEqual([]);
    expect(ids('npx tsc --noEmit')).toEqual([]);
  });

  it('service CLI lifecycle subcommands introduce the service', () => {
    expect(ids('supabase init')).toEqual(['svc:supabase']);
    expect(ids('firebase deploy')).toEqual(['svc:firebase']);
    expect(ids('vercel --prod deploy'.replace('--prod deploy', 'deploy'))).toEqual(['svc:vercel']);
    expect(ids('aws configure')).toEqual(['svc:aws']);
    expect(ids('gcloud auth login')).toEqual(['svc:google-cloud']);
    expect(ids('wrangler deploy')).toEqual(['svc:cloudflare']);
  });

  it('non-introducing commands stay silent (false-positive control)', () => {
    const routine = [
      'git init',
      'git status',
      'git commit -m "x"',
      'gh auth login',
      'npm test',
      'npm run build',
      'vitest run',
      'pytest -q',
      'cargo build',
      'go build ./...',
      'ls -la',
      'cat package.json',
      'node --version',
      'terraform validate',
      'kubectl get pods',
      'curl https://api.github.com/repos/x',
      'echo done',
      'rm -rf dist && npm run build',
    ];
    for (const command of routine) {
      expect(ids(command), command).toEqual([]);
    }
  });

  it('multi-segment commands split correctly', () => {
    expect(ids('cd app && npm install stripe')).toEqual(['svc:stripe']);
    expect(ids('echo hi; pip install boto3')).toEqual(['svc:aws']);
    expect(ids('npm install x || npm install y')).toEqual(['npm:x', 'npm:y']);
    expect(ids('FOO=1 npm install z')).toEqual(['npm:z']);
    expect(ids('sudo npm install @anthropic-ai/sdk')).toEqual(['svc:anthropic']);
  });

  it('shell redirections are never packages (live-test regression: npm:2)', () => {
    expect(ids('npm install supabase --dry-run 2>&1')).toEqual(['svc:supabase']);
    expect(ids('pip install flask > /dev/null 2>&1')).toEqual(['svc:flask']);
    expect(ids('npm test >out.log 2>err.log')).toEqual([]);
  });

  it('windows forms are handled', () => {
    expect(ids('npm.cmd install supabase')).toEqual(['svc:supabase']);
    expect(ids('"C:\\Program Files\\nodejs\\npm" install stripe')).toEqual(['svc:stripe']);
    expect(ids('python.exe -m pip install pymongo')).toEqual(['svc:mongodb']);
  });

  it('mcp add command', () => {
    expect(ids('claude mcp add github')).toEqual(['mcp:github']);
    expect(ids('codex mcp add filesystem')).toEqual(['mcp:filesystem']);
  });

  it('tokenize / splitSegments / programOf primitives', () => {
    expect(tokenize('npm install "my pkg"')).toEqual(['npm', 'install', 'my pkg']);
    expect(splitSegments('a && b; c | d')).toHaveLength(4);
    expect(programOf('C:\\tools\\docker.cmd')).toBe('docker');
  });
});

describe('signal aggregation (extractSignals)', () => {
  it('Bash tool', () => {
    const r = extractSignals('Bash', { command: 'npm install supabase' });
    expect(r.introductions.map((i) => i.entityId)).toEqual(['svc:supabase']);
  });

  it('MCP tool names resolve to the server entity', () => {
    const r = extractSignals('mcp__github__create_issue', {});
    expect(r.introductions[0]?.entityId).toBe('mcp:github');
    expect(r.introductions[0]?.category).toBe('plugin_mcp');
  });

  it('curl records an anchor, never an introduction', () => {
    const r = extractSignals('Bash', { command: 'curl -s https://api.stripe.com/health' });
    expect(r.introductions).toEqual([]);
    expect(r.anchors[0]?.kind).toBe('outbound_request');
  });

  it('unknown tools produce nothing', () => {
    expect(extractSignals('Read', { file_path: '/x' }).introductions).toEqual([]);
  });
});
