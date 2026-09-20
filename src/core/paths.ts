import { homedir } from 'node:os';
import { join } from 'node:path';

export interface HilPaths {
  /** `~/.hil` (or `$HIL_HOME`). */
  hilHome: string;
  stateDir: string;
  globalConfigYaml: string;
  globalBoundaryYaml: string;
  globalDb: string;
  globalCacheDir: string;
  globalTrustCache: string;
  globalConfigCache: string;
  projectDir: string;
  projectHilDir: string;
  projectConfigYaml: string;
  projectBoundaryYaml: string;
  projectCacheDir: string;
  projectTrustCache: string;
}

export function resolvePaths(projectDir: string, env: NodeJS.ProcessEnv = process.env): HilPaths {
  const hilHome = env.HIL_HOME ?? join(homedir(), '.hil');
  const projectHilDir = join(projectDir, '.hil');
  return {
    hilHome,
    stateDir: join(hilHome, 'state'),
    globalConfigYaml: join(hilHome, 'config.yaml'),
    globalBoundaryYaml: join(hilHome, 'trust-boundary.yaml'),
    globalDb: join(hilHome, 'hil.db'),
    globalCacheDir: join(hilHome, 'cache'),
    globalTrustCache: join(hilHome, 'cache', 'trust.json'),
    globalConfigCache: join(hilHome, 'cache', 'config.json'),
    projectDir,
    projectHilDir,
    projectConfigYaml: join(projectHilDir, 'config.yaml'),
    projectBoundaryYaml: join(projectHilDir, 'trust-boundary.yaml'),
    projectCacheDir: join(projectHilDir, 'cache'),
    projectTrustCache: join(projectHilDir, 'cache', 'trust.json'),
  };
}
