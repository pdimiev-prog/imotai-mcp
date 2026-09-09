import { VERSION } from './version.js';

export const config = {
  apiUrl: (process.env.IMOTAI_API_URL ?? 'https://imotai.bg/api').replace(/\/+$/, ''),
  userAgent: `imotai-mcp-server/${VERSION} (+https://imotai.bg)`,
  httpTimeoutMs: Number(process.env.IMOTAI_HTTP_TIMEOUT_MS) || 15_000,
};
