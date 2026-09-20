/**
 * Signal aggregation: one entry point from a (toolName, toolInput) pair to
 * introductions + anchors, regardless of the originating agent.
 */
import type { EntityIntroduction, SignalAnchor } from '../events/types.js';
import { normalizeEntity } from '../trust/entities.js';
import { extractFromCommand } from './commands.js';
import { extractFromFileEdit, extractFromFileWrite } from './files.js';

export interface ToolSignals {
  introductions: EntityIntroduction[];
  anchors: SignalAnchor[];
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Shell']);

function outboundAnchors(command: string): SignalAnchor[] {
  for (const segment of command.split(/\s*(?:&&|\|\||;|\||\n)\s*/)) {
    const first = segment.trim().split(/\s+/)[0] ?? '';
    const program = first
      .replace(/^.*[\\/]/, '')
      .replace(/\.(cmd|exe|bat|ps1)$/i, '')
      .toLowerCase();
    if (
      program === 'curl' ||
      program === 'wget' ||
      program === 'invoke-webrequest' ||
      program === 'iwr'
    ) {
      return [{ kind: 'outbound_request', detail: segment.trim().slice(0, 200) }];
    }
  }
  return [];
}

export function extractSignals(toolName: string, toolInput: Record<string, unknown>): ToolSignals {
  // MCP tool call: mcp__<server>__<tool> — the server itself is the entity
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    const server = parts[1];
    if (server) {
      const normalized = normalizeEntity(server, 'mcp');
      return {
        introductions: [
          {
            entityId: normalized.id,
            displayName: normalized.displayName,
            category: 'plugin_mcp',
            via: 'mcp',
            detail: `MCP tool ${toolName}`,
            ecosystem: normalized.ecosystem,
          },
        ],
        anchors: [{ kind: 'mcp_usage', detail: toolName }],
      };
    }
    return { introductions: [], anchors: [] };
  }

  if (SHELL_TOOLS.has(toolName)) {
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    return {
      introductions: extractFromCommand(command),
      anchors: outboundAnchors(command),
    };
  }

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
    if (!filePath) return { introductions: [], anchors: [] };
    if (toolName === 'Write') {
      const content = typeof toolInput.content === 'string' ? toolInput.content : '';
      return extractFromFileWrite(filePath, content);
    }
    const newString =
      toolName === 'Edit'
        ? typeof toolInput.new_string === 'string'
          ? toolInput.new_string
          : ''
        : JSON.stringify(toolInput.edits ?? '');
    return extractFromFileEdit(filePath, newString);
  }

  return { introductions: [], anchors: [] };
}
