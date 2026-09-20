/** MCP tool-name helpers (Claude Code & Codex both use `mcp__<server>__<tool>`). */

export interface McpToolName {
  server: string;
  tool: string;
}

export function parseMcpToolName(toolName: string): McpToolName | null {
  if (!toolName.startsWith('mcp__')) return null;
  const parts = toolName.slice('mcp__'.length).split('__');
  const server = parts[0];
  const tool = parts.slice(1).join('__');
  if (!server || !tool) return null;
  return { server, tool };
}
