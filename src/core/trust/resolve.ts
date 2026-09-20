/**
 * Trust resolution across scopes (spec §12): session → project → global → unknown.
 */
import type { ResolvedTrust, TrustEntity, TrustStatus } from './entities.js';
import { normalizeEntity } from './entities.js';

export interface SessionTrustGrant {
  id: string;
  status: TrustStatus;
  expiresAt?: number;
}

export interface TrustIndex {
  /** id → entity */
  byId: Map<string, TrustEntity>;
  /** alias (lowercased, ecosystem-free) → id */
  byAlias: Map<string, string>;
}

export function buildIndex(entities: TrustEntity[]): TrustIndex {
  const byId = new Map<string, TrustEntity>();
  const byAlias = new Map<string, string>();
  for (const entity of entities) {
    byId.set(entity.id, entity);
    byAlias.set(entity.name.toLowerCase(), entity.id);
    if (entity.aliases) {
      for (const alias of entity.aliases) {
        byAlias.set(alias.toLowerCase(), entity.id);
      }
    }
  }
  return { byId, byAlias };
}

export function isExpired(entity: TrustEntity, now: number): boolean {
  return (
    entity.status === 'temporary' && typeof entity.expiresAt === 'number' && entity.expiresAt <= now
  );
}

/**
 * Resolve a raw name against the full scope chain.
 * `sessionTrust` entries and temporary entities past `expiresAt` fall through
 * to the next scope rather than disappearing entirely.
 */
export function resolve(
  rawName: string,
  ecosystem: string | undefined,
  chain: {
    session: SessionTrustGrant[];
    project?: TrustIndex;
    global?: TrustIndex;
  },
  now: number,
): ResolvedTrust {
  const normalized = normalizeEntity(rawName, ecosystem);

  for (const grant of chain.session) {
    if (grant.id !== normalized.id) continue;
    if (grant.status === 'temporary' && (grant.expiresAt ?? 0) <= now) continue;
    return { status: grant.status, scope: 'session' };
  }

  for (const level of ['project', 'global'] as const) {
    const index = chain[level];
    if (!index) continue;
    let entity = index.byId.get(normalized.id);
    if (!entity) {
      // try the display-name / alias of the normalized entity
      const aliased = index.byAlias.get(normalized.displayName.toLowerCase());
      if (aliased) entity = index.byId.get(aliased);
    }
    if (!entity && ecosystem) {
      // `hil trust add left-pad` (no ecosystem) stored svc:left-pad; the signal
      // arrives as npm:left-pad — and vice versa. Unify via the bare name.
      const plain = normalized.id.split(':')[1];
      if (plain) entity = index.byId.get(`svc:${plain}`);
    }
    if (entity && !isExpired(entity, now)) {
      return { status: entity.status, scope: level, entity };
    }
  }

  return { status: 'unknown', scope: 'default' };
}
