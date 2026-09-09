#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './api-client.js';
import { registerTools } from './tools/index.js';
import { VERSION } from './version.js';

async function main(): Promise<void> {
  const server = new McpServer({ name: 'imotai', version: VERSION });
  registerTools(server, new ApiClient());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the JSON-RPC channel.
  process.stderr.write(`imotai-mcp-server ${VERSION} ready (stdio)\n`);
}

main().catch((err) => {
  process.stderr.write(`imotai-mcp-server fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
