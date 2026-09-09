# ImotAI MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI
agents (Claude Desktop, Claude Code, …) a **read-only** window onto Bulgarian
real-estate data from [imotai.bg](https://imotai.bg).

It is a thin client over the site's public API — no API keys, no writes, no
personal data (broker names, phones and free-text descriptions never leave the
API). Numbers are based on **current asking prices of active listings**, not on
closed transactions.

## Status

**M5 — five tools.** `list_districts`, `search_properties`, `get_property`,
`get_market_stats` and `estimate_value` are live; the property tools carry a
`marketContext` block. Next: rate limiting, then a public GitHub repo.

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

### `get_market_stats`

**Input:** `{ city: string, district?: string }` — slugs or Bulgarian names from
`list_districts`. Omit `district` for city-level stats.

**Output:** `{ available: true, city, district, count, avgPrice, avgPricePerSqm,
price: {p25,p50,p75}, pricePerSqm: {p25,p50,p75}, byRooms: [...],
neighbouringDistricts: [...], basis, url }`. Sale offers, all residential types.
Below 8 offers → `{ available: false, count, reason }`. Unknown city/district →
`{ error }` pointing at `list_districts`.

## Market context

Both property tools attach a `marketContext` — "is this listing priced above or
below its district":

- **`get_property.marketContext`** is the authoritative per-listing figure from
  ImotAI's own calculation: `districtAveragePricePerSqm`, `districtMedianPricePerSqm`,
  `deviationPercent` (+ = pricier than the district), `comparableActiveListings`,
  `basedOnCount`, `pricePageUrl`.
- **`search_properties[].marketContext`** is a lighter district-level
  approximation for scanning (one price-page lookup per distinct district):
  `districtAveragePricePerSqm`, `deviationPercent`, `comparableListings`, `basis`.

Both are `null` when the district has fewer than 8 offers or no price page. The
two levels use slightly different denominators, so their numbers are close but
not identical — the `get_property` figure is the precise one.

## `estimate_value`

**Input:**

| Field | Type | Notes |
|---|---|---|
| `city` | string, required | Slug or Bulgarian name from `list_districts` |
| `district` | string, required | Slug or Bulgarian name from `list_districts` |
| `propertyType` | enum, required | `apartment`, `house`, `villa`, `studio`, `land` |
| `area` | number, required | Living area in m² |
| `rooms` | integer | Accepted but **not** used for filtering |

**Output:**

```jsonc
{
  "available": true,
  "estimate": 208000,
  "rangeLow": 184000,
  "rangeHigh": 240000,
  "basedOnCount": 40,
  "confidence": "medium",          // from sample size; forced "low" for the market blend
  "disclaimer": "…",               // ALWAYS present — show verbatim
  "referenceUrl": "https://imotai.bg/ceni/sofia/lozenets"
}
```

Below 5 comparable offers it returns `{ "available": false, "reason": "…",
"disclaimer": "…" }` — still with a `disclaimer`. An unknown city or district
returns `{ "error": "…" }` pointing at `list_districts` (no `disclaimer` there).

`confidence` is `high` at ≥ 50 comparable offers, `medium` at ≥ 15, otherwise
`low`; it is **always `low`** when external market data (imot.bg / alo.bg / Grok)
was blended into the figure, and the `disclaimer` then says so.

> ⚠️ **This is positioning against the CURRENT ASKING PRICES of comparable active
> listings — not an appraisal, not an official valuation, not based on closed
> transactions.** The `disclaimer` field is present on every `available` result;
> show it to the user verbatim whenever you cite any number from this tool.

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
