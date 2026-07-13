# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start server with hot reload (tsx watch)
npm run build    # compile TypeScript to dist/
npm start        # run compiled output
npm run smoke    # run the upstream drift detector against the live site
```

No unit test runner is configured. `npm run smoke` is an end-to-end check against the live upstream — see [Monitoring / drift detection](#monitoring--drift-detection).

## Monitoring / drift detection

The upstream is a legacy ASP.NET site whose markup can change at any time (e.g. seasonal lines like the summer beach line 26). It never returns an error when this happens — it returns a healthy `200` that the scraper's selectors no longer match. The signal to watch for is therefore **"200 OK but 0 rows parsed"**.

- `src/smoke.ts` (`npm run smoke`) runs the **real scraper** end-to-end — not a parallel copy of the parsing — and asserts each step extracts data. IDs are discovered dynamically (first line → its first route → its first stop), so it adapts automatically as lines come and go.
- Checks are **HARD** (must have data: lines, routes, stops, coordinates, stop cache) or **SOFT** (legitimately empty sometimes: arrivals outside service hours, live vehicles since upstream GPS is dead). Exit code is `1` if any HARD check fails or throws, else `0` — so it can gate CI/cron.
- `.github/workflows/smoke.yml` runs it **daily at 08:00 UTC** plus on-demand via `workflow_dispatch`, and the job goes red on drift. It is scheduled/manual only (not on push/PR) so a green build never depends on the third-party server being reachable at commit time. Note: `schedule` and `workflow_dispatch` only fire from the default branch.

When a HARD check fails it almost always means a cheerio selector in `src/services/scraper.ts` no longer matches the upstream HTML. Fetch the relevant page (see [Upstream URL reference](#upstream-url-reference)) and re-derive the selector for that step.

## Architecture

This is a **scraper API** built with Hono + Node.js that wraps an ASP.NET bus schedule website (`http://77.224.241.76/sanfernando/mobile/`) and exposes its data as JSON.

### Data flow

The upstream site is a legacy ASP.NET WebForms app. Navigating it requires:
1. **GET** a page to obtain `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, and `__EVENTVALIDATION` hidden fields
2. **POST** a form submit button (by including the button's `name` as a form field) — the server responds with a **302 redirect** whose `Location` header contains the real resource URL with an internal numeric ID
3. **GET** the redirect target using that internal ID

### Key design decisions

- `BusLine.id` is the human-facing line number (1, 2…); `BusLine.internalId` is the server's internal ID (e.g. 21, 22…). These differ and cannot be assumed to follow a pattern.
- Internal IDs are resolved via **parallel POSTs** (`Promise.all`) — one POST per line — to avoid sequential N+1 latency.
- `axios` is configured with `maxRedirects: 0` for the POST step so the 302 response can be intercepted and the `Location` header parsed to extract the `line=<id>` parameter.

### File roles

- `src/services/scraper.ts` — all HTTP fetching and HTML parsing (cheerio). Single source of truth for upstream interactions.
- `src/routes/lines.ts` — Hono route handlers for `/lines/*`; input validation only, delegates to scraper.
- `src/routes/stops.ts` — Hono route handlers for `/stops/*`.
- `src/types.ts` — shared interfaces (`BusLine`, `Route`, `Stop`, `BusTime`, `StopGeoPoint`, `RouteGeoData`, `Vehicle`, `StopVehicles`, `NearbyStop`, `StopRoute`).
- `src/index.ts` — server entry point, route mounting, port config.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lines` | All bus lines. Accepts `?date=DD/MM/YYYY` (defaults to today). |
| GET | `/lines/:id/routes` | Routes for a line by human-facing ID. Accepts `?date=DD/MM/YYYY`. |
| GET | `/lines/:id/routes/:routeId/stops` | Stops for a route. Accepts `?date=DD/MM/YYYY`. |
| GET | `/lines/:id/routes/:routeId/stops/:stopCode/times` | Upcoming arrivals for a stop. Accepts `?date=DD/MM/YYYY`. |
| GET | `/lines/:id/routes/:routeId/geodata` | Ordered stops with lat/lon for map rendering. Accepts `?date=DD/MM/YYYY`. |
| GET | `/lines/:id/routes/:routeId/shape` | Road-following GPS path via OSRM. `source` is `"osrm"` (road-snapped polyline) or `"stops"` (stop-to-stop fallback if OSRM fails). Accepts `?date=DD/MM/YYYY`. |
| GET | `/lines/:id/routes/:routeId/schedule` | Next arrival at every stop on the route in sequence, including `lat`/`lon` per stop. Use this as the single endpoint for full route map + arrival list. Arrival is `{ raw, type, minutes }` — `type` is `"relative"` or `"absolute"`. Accepts `?date=DD/MM/YYYY`. |
| GET | `/stops/:stopCode/vehicles` | Live vehicle positions approaching a stop. Returns `[]` when no buses are running. |
| GET | `/stops/nearby?lat=&lon=&radius=` | Stops within `radius` meters (default 500, max 5000) sorted by distance. First call is slow (~3s) while the stop cache warms; subsequent calls are instant. |
| GET | `/search?q=` | Search lines by number or name, and stops by name. Returns `{ lines: [{ id, name, routes }], stops }`. Stops include `nextArrival: { raw, type, minutes } \| null` (soonest bus across all routes). Accepts `?lat=&lon=` to populate `distanceMeters` on each stop. First call slow if stop cache is cold. |

### Upstream URL reference

| Page | URL pattern |
|------|-------------|
| Lines list | `lines.aspx?t4=DD/MM/YYYY` |
| Routes for a line | `routes.aspx?line=<internalId>` |
| Stops for a route | `search.aspx?route=<internalLineId><routeId padded to 4 digits>` (e.g. line 21 route 2 → `210002`) |
| Arrival times for a stop | `panel.aspx?stop=<stopCode>&route=<routeParam>` — arrival is a raw string, either relative (`22min`) or absolute (`20:54`) |

### SOAP services (`/sanfernando/PresenterService.asmx`)

Used for stop coordinates. `GetParada(iIdParada)` returns `dLat`/`dLong` for a single stop. Other methods exist (`GetTrayectoGeoPoints`, `GetParadasTrayecto`) but return empty data on this server. All SOAP calls use `Content-Type: text/xml` POST with `SOAPAction` header.

`SynopticState.asmx` — `getVehiculos(iIdParada)` returns live vehicle positions (`JSonPosicion` elements) with `dLat`/`dLon`, `velocidad`, `distanciaParada`, `retraso`, `destino`. Returns empty when no buses are running.

### CTAN GTFS feed (interurban lines)

The Consorcio Metropolitano de Transportes de la Bahía de Cádiz (CMTBC) publishes a unified GTFS feed for all Andalusian transport consortiums:

```
https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip
```

- Updates daily. Agency ID in the feed: `CMTBC`.
- Contains interurban lines passing through San Fernando: M-010, M-011 (Cádiz↔San Fernando), M-120 (Chiclana↔San Fernando), M-130 (San Fernando↔Campus Universitario), and others.
- **Does NOT contain the urban Línea 1 / Línea 2 routes** — those are operated separately and are only available via the ASP.NET scraper.
- GTFS stop IDs use format `2_<n>` (e.g. `2_49` = Bahía Sur). These do NOT match the ASP.NET stop codes (e.g. `2101`), but coordinates match within ~10m.
- `shapes.txt` in the ZIP has accurate GPS polylines for each interurban route (`shape_id` format: `2_7_I` / `2_7_V` for inbound/outbound).
- Lookup path: `routes.txt` (route_id) → `trips.txt` (shape_id) → `shapes.txt` (ordered lat/lon points).
- API documentation: https://api.ctan.es/doc/
