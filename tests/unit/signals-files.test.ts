import { describe, expect, it } from 'vitest';
import { extractFromFileEdit, extractFromFileWrite } from '../../src/core/signals/files';

const writeIds = (path: string, content: string) =>
  extractFromFileWrite(path, content).introductions.map((i) => i.entityId);
const editIds = (path: string, content: string) =>
  extractFromFileEdit(path, content).introductions.map((i) => i.entityId);

describe('manifest signals (Write, full content)', () => {
  it('package.json dependencies', () => {
    const content = JSON.stringify({
      name: 'app',
      dependencies: { next: '^15', '@supabase/supabase-js': '^2' },
      devDependencies: { vitest: '^3' },
      scripts: { build: 'vite build' },
    });
    expect(writeIds('package.json', content)).toEqual([
      'svc:next.js',
      'svc:supabase',
      'npm:vitest',
    ]);
  });

  it('package.json scripts never leak in as packages', () => {
    const content = JSON.stringify({ scripts: { build: 'vite', deploy: 'vercel' } });
    expect(writeIds('package.json', content)).toEqual([]);
  });

  it('requirements.txt', () => {
    expect(
      writeIds('requirements.txt', '# comment\nfastapi==0.1\nuvicorn[standard]>=0.3\n-r other.txt'),
    ).toEqual(['svc:fastapi', 'pypi:uvicorn']);
  });

  it('pyproject.toml PEP 621 and poetry sections', () => {
    const content = [
      '[project]',
      'name = "app"',
      'dependencies = [',
      '  "httpx>=0.27",',
      '  "pymongo",',
      ']',
      '[tool.poetry.dependencies]',
      'python = "^3.12"',
      'rich = "^13"',
    ].join('\n');
    expect(writeIds('pyproject.toml', content)).toEqual(['pypi:httpx', 'svc:mongodb', 'pypi:rich']);
  });

  it('go.mod direct requires only (indirect skipped)', () => {
    const content = [
      'module app',
      '',
      'require (',
      '\tgithub.com/gin-gonic/gin v1.10',
      '\tgolang.org/x/text v0.1 // indirect',
      ')',
    ].join('\n');
    expect(writeIds('go.mod', content)).toEqual(['go:gin-gonic/gin']);
  });

  it('Cargo.toml dependencies sections', () => {
    const content = [
      '[dependencies]',
      'serde = { version = "1" }',
      'tokio = "1"',
      '',
      '[dev-dependencies]',
      'criterion = "0.5"',
    ].join('\n');
    expect(writeIds('Cargo.toml', content)).toEqual([
      'cargo:serde',
      'cargo:tokio',
      'cargo:criterion',
    ]);
  });

  it('Dockerfile FROM and compose images', () => {
    expect(writeIds('Dockerfile', 'FROM node:24\nRUN npm ci\n')).toEqual(['docker:node']);
    expect(writeIds('docker-compose.yml', 'services:\n  db:\n    image: postgres:16\n')).toEqual([
      'svc:postgresql',
    ]);
  });

  it('.env creation implies service connection', () => {
    expect(writeIds('.env.local', 'SUPABASE_URL=https://x\nSTRIPE_KEY=sk_1\n')).toEqual([
      'svc:supabase',
      'svc:stripe',
    ]);
    expect(writeIds('.env', 'PORT=3000\nNODE_ENV=dev\n')).toEqual([]);
  });

  it('service config files', () => {
    expect(writeIds('firebase.json', '{}')).toEqual(['svc:firebase']);
    expect(writeIds('vercel.json', '{}')).toEqual(['svc:vercel']);
    expect(writeIds('wrangler.toml', 'name = "x"')).toEqual(['svc:cloudflare']);
  });

  it('terraform is an anchor only (no provider guessing in v0.1)', () => {
    const r = extractFromFileWrite('main.tf', 'provider "aws" {}');
    expect(r.introductions).toEqual([]);
    expect(r.anchors[0]?.kind).toBe('infra_file');
  });

  it('unrelated files produce nothing', () => {
    expect(writeIds('src/app.ts', 'export const x = 1;')).toEqual([]);
  });
});

describe('fragment safety (Edit, new_string only)', () => {
  it('line-safe formats extract from fragments', () => {
    expect(editIds('requirements.txt', 'stripe>=7\n')).toEqual(['svc:stripe']);
    expect(editIds('Dockerfile', 'FROM redis:7\n')).toEqual(['svc:redis']);
    expect(editIds('docker-compose.yml', '    image: mongo:7\n')).toEqual(['svc:mongodb']);
    expect(editIds('.env', 'OPENAI_API_KEY=sk-x\n')).toEqual(['svc:openai']);
  });

  it('package.json / pyproject / Cargo edits record an anchor, never a guess', () => {
    for (const file of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']) {
      const r = extractFromFileEdit(file, '"supabase": "^2"');
      expect(r.introductions, file).toEqual([]);
      expect(r.anchors[0]?.kind, file).toBe('manifest_edit_unparsed');
    }
  });
});
