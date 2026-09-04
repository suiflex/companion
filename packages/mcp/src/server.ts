import { readFile, stat } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CompanionStore } from '@meetcc/store';
import { callTool, loadSnapshot, TOOL_DEFINITIONS } from './tools';

// stdio MCP server over a snapshot exported from the extension:
//   companion-mcp /path/to/companion-snapshot.json
// Read-only, offline, and reloaded automatically when the file changes.
// Built to dist/server.js by vite.config.ts — see that file for why.

const path = process.argv[2];
if (!path) {
  console.error('Usage: companion-mcp <companion-export.json>');
  process.exit(1);
}

let store: CompanionStore | null = null;
let loadedAt = 0;

async function currentStore(): Promise<CompanionStore> {
  const mtime = (await stat(path)).mtimeMs;
  if (store && mtime <= loadedAt) return store;
  store?.close();
  store = await loadSnapshot({
    read: async () => JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>,
  });
  loadedAt = mtime;
  return store;
}

const server = new Server(
  { name: 'companion', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOL_DEFINITIONS] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return callTool(
      await currentStore(),
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
    );
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Failed: ${(e as Error).message}` }],
      isError: true,
    };
  }
});

await server.connect(new StdioServerTransport());
