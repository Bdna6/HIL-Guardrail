/**
 * Parse a trust-boundary.yaml authoring file. The `parse` function is injected
 * so this module stays import-free on the hot path.
 */
import { readFileSync } from 'node:fs';
import type { Category, EntitySource, Scope, TrustEntity, TrustStatus } from './entities.js';
import { normalizeEntity } from './entities.js';

interface BoundaryYamlShape {
  version?: number;
  tools?: Array<{
    name: string;
    category?: string;
    ecosystem?: string;
    status?: string;
    aliases?: string[];
    notes?: string;
  }>;
}

export function parseBoundaryYamlFile(
  file: string,
  parse: (text: string) => unknown,
): TrustEntity[] {
  return parseBoundaryYaml(file, parse, { scope: 'global', source: 'config' });
}

export function parseBoundaryYaml(
  file: string,
  parse: (text: string) => unknown,
  opts: { scope: Scope; source: EntitySource },
): TrustEntity[] {
  let raw: BoundaryYamlShape | null = null;
  try {
    raw = parse(readFileSync(file, 'utf8')) as BoundaryYamlShape | null;
  } catch {
    return [];
  }
  if (!raw || !Array.isArray(raw.tools)) return [];

  const entities: TrustEntity[] = [];
  for (const tool of raw.tools) {
    if (!tool || typeof tool.name !== 'string' || tool.name.trim() === '') continue;
    const normalized = normalizeEntity(tool.name, tool.ecosystem);
    entities.push({
      id: normalized.id,
      name: tool.name.trim(),
      category: (tool.category as Category) ?? normalized.category,
      // Listing a tool in the boundary means the user has at least reviewed it.
      status: (tool.status as TrustStatus) ?? 'trusted',
      scope: opts.scope,
      source: opts.source,
      aliases: tool.aliases?.map((a) => a.toLowerCase()) ?? [],
      ...(tool.ecosystem ? { ecosystem: tool.ecosystem } : {}),
      ...(tool.notes ? { notes: tool.notes } : {}),
    });
  }
  return entities;
}
