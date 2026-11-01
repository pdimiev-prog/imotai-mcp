import { VERSION } from './version.js';

export const config = {
  apiUrl: (process.env.IMOTAI_API_URL ?? 'https://imotai.bg/api').replace(/\/+$/, ''),
  // „bot“ в името: прегледите на обявите не се броят от ботове (VIEW_BOT_UA_RE в API-то).
  userAgent: `ImotAI-MCP-bot/${VERSION} (+https://imotai.bg/mcp)`,
  httpTimeoutMs: Number(process.env.IMOTAI_HTTP_TIMEOUT_MS) || 15_000,
  rateLimitPerMin: Number(process.env.IMOTAI_RATE_LIMIT_PER_MIN) || 60,
};
