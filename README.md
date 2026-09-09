# ImotAI MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI
agents (Claude Desktop, Claude Code, …) a **read-only** window onto Bulgarian
real-estate data from [imotai.bg](https://imotai.bg).

It is a thin client over the site's public API — no API keys, no writes, no
personal data (broker names, phones and free-text descriptions never leave the
API). Numbers are based on **current asking prices of active listings**, not on
closed transactions.

## Status

**M2 — three tools.** `list_districts`, `search_properties` and `get_property` are
live. `get_market_stats` and `estimate_value` come next; per-listing market context
is added after that.

## Install

```bash
pnpm install
pnpm --filter imotai-mcp-server build   # produces dist/index.js
```

## Use it in Claude Desktop

Add this to `claude_desktop_config.json` (use the **absolute** path to `dist/index.js`):

```json
{
  "mcpServers": {
    "imotai": {
      "command": "node",
      "args": ["/absolute/path/to/apps/mcp-server/dist/index.js"],
      "env": { "IMOTAI_API_URL": "https://imotai.bg/api" }
    }
  }
}
```

Restart Claude Desktop, then ask something like:

> *Which districts does ImotAI track in Sofia, and how many active listings are in each?*

Claude will call `list_districts` and answer from the result.

## Tools

### `list_districts`

**Input:** `{ city: string }` — a city slug (`"sofia"`) or its Bulgarian name (`"София"`).

**Output:**

```jsonc
{
  "city": { "slug": "sofia", "name": "София" },
  "districts": [
    { "name": "Лозенец", "slug": "lozenets", "activeListings": 64 },
    { "name": "Витоша",  "slug": "vitosha",  "activeListings": null }
  ],
  "note": "activeListings is filled only for districts with a public price page (>= 8 offers); a null count does not mean zero."
}
```

An unknown city returns `{ "error": "Unknown city \"…\". Recognised city slugs: …" }`.
Call this first — the slugs it returns are the valid `district` values for the
other tools.

### `search_properties`

**Input:**

| Field | Type | Notes |
|---|---|---|
| `city` | string, required | Slug or Bulgarian name |
| `transactionType` | `"sale"` \| `"rent"`, required | |
| `district` | string | Slug from `list_districts` |
| `propertyType` | enum | `apartment`, `house`, `villa`, `studio`, `office`, `shop`, `warehouse`, `land`, `garage`, `other` |
| `minPrice` / `maxPrice` | number | EUR |
| `minArea` / `maxArea` | number | m² |
| `rooms` | string | CSV, e.g. `"2,3"`; `"5+"` for 5 or more |
| `limit` | integer 1–25 | Default 10 |

**Output:** `{ results: [...], total, shown }`. Each result has structured fields
plus a `url` to the listing. No contact details, no free-text description, no
coordinates.

### `get_property`

**Input:** `{ id: string }` — the listing's UUID **or** its URL slug.

**Output:** `{ found: true, url, ...structured fields, features: [] }`, or
`{ found: false, reason }` if there is no such listing. Never returns the broker
description, phone/name, or exact coordinates.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `IMOTAI_API_URL` | `https://imotai.bg/api` | Base URL of the ImotAI public API |
| `IMOTAI_HTTP_TIMEOUT_MS` | `15000` | Per-request timeout |

## How it works

`stdio` MCP server (Node ≥ 20, ESM). Each tool maps to one or two calls against
the public `imotai.bg/api` endpoints and reshapes the response through an
explicit field allowlist. No state, no cache, no credentials.

## Licence

MIT.
