#!/usr/bin/env node
/**
 * Онлайн режим (https://imotai.bg/mcp, БА 02.11.2026): MCP през Streamable HTTP,
 * без сесии — всяка заявка получава свой сървър. Само четене, без лични данни.
 * Лимит: на посетител (по IP от Cloudflare) + общ за целия процес.
 * Пуска се като отделен PM2 процес зад Nginx; сайтът и API-то не зависят от него.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiClient } from './api-client.js';
import { registerTools } from './tools/index.js';
import { TokenBucketRateLimiter, type RateGate } from './rate-limit.js';
import { VERSION } from './version.js';

const PORT = Number(process.env.PORT) || 4100;
const HOST = process.env.HOST || '127.0.0.1';
const PER_CLIENT_PER_MIN = Number(process.env.IMOTAI_MCP_PER_CLIENT_PER_MIN) || 30;
const GLOBAL_PER_MIN = Number(process.env.IMOTAI_MCP_GLOBAL_PER_MIN) || 300;
const MAX_BODY_BYTES = 256 * 1024;

const globalGate = new TokenBucketRateLimiter({ ratePerMinute: GLOBAL_PER_MIN });
const clientGates = new Map<string, { gate: TokenBucketRateLimiter; seen: number }>();

/** И двата лимита — на посетителя и общият; първият изчерпан спира заявката. */
function gateFor(ip: string): RateGate {
  let entry = clientGates.get(ip);
  if (!entry) {
    entry = { gate: new TokenBucketRateLimiter({ ratePerMinute: PER_CLIENT_PER_MIN }), seen: Date.now() };
    clientGates.set(ip, entry);
  }
  entry.seen = Date.now();
  const own = entry.gate;
  return {
    take(cost = 1) {
      own.take(cost);
      globalGate.take(cost);
    },
  };
}

// Забравяме посетители, неактивни над 10 мин — паметта не расте.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [ip, e] of clientGates) if (e.seen < cutoff) clientGates.delete(ip);
}, 60_000).unref();

function clientIp(req: IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

const INFO = {
  name: 'ImotAI MCP server',
  version: VERSION,
  description:
    'Read-only access to Bulgarian real-estate listings and market prices on imotai.bg for AI assistants: ' +
    'search listings, one listing, district price statistics, monthly market reports, rough value positioning.',
  endpoint: 'https://imotai.bg/mcp',
  transport: 'streamable-http',
  tools: ['list_districts', 'search_properties', 'get_property', 'get_market_stats', 'get_market_report', 'estimate_value'],
  docs: 'https://imotai.bg/llms.txt',
  license: 'Data: CC BY 4.0 — credit ImotAI (imotai.bg). No personal or contact data is exposed.',
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (path === '/health') return sendJson(res, 200, { ok: true, version: VERSION });
  if (path !== '/mcp') return sendJson(res, 404, { error: 'Not found' });

  if (req.method === 'GET') {
    // Без сесии няма поток (SSE) — клиентите, които го искат, получават 405, както казва спецификацията.
    if (String(req.headers.accept ?? '').includes('text/event-stream')) {
      return sendJson(res, 405, { error: 'This server is stateless; use POST.' });
    }
    return sendJson(res, 200, INFO);
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Invalid request body.' }, id: null });
  }

  const mcp = new McpServer({ name: 'imotai', version: VERSION });
  registerTools(mcp, new ApiClient({ baseUrl: process.env.IMOTAI_API_URL, limiter: gateFor(clientIp(req)) }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void mcp.close();
  });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    process.stderr.write(`mcp request failed: ${(err as Error).message}\n`);
    if (!res.headersSent) {
      sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error.' }, id: null });
    }
  }
});

server.listen(PORT, HOST, () => {
  process.stderr.write(`imotai-mcp-server ${VERSION} ready (http ${HOST}:${PORT}/mcp)\n`);
});
