// Copies non-TS runtime assets into dist/ so the published package is self-contained.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');

mkdirSync(dist, { recursive: true });
for (const asset of ['locales']) {
  const from = join(root, asset);
  if (existsSync(from)) {
    cpSync(from, join(dist, asset), { recursive: true });
    console.log(`copied ${asset}/ → dist/${asset}/`);
  }
}
