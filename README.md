# San Fernando Buses API

A REST API that scrapes the San Fernando (Cádiz) public bus schedule website and exposes its data as clean JSON. Built with Hono + Node.js + TypeScript.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lines` | All bus lines |
| GET | `/lines/:id/routes` | Routes for a line |
| GET | `/lines/:id/routes/:routeId/stops` | Stops for a route |
| GET | `/lines/:id/routes/:routeId/stops/:stopCode/times` | Upcoming arrivals at a stop |
| GET | `/lines/:id/routes/:routeId/geodata` | Stops with lat/lon coordinates |
| GET | `/lines/:id/routes/:routeId/shape` | Road-following GPS polyline via OSRM |
| GET | `/lines/:id/routes/:routeId/schedule` | Next arrival at every stop on the route (includes lat/lon per stop) |
| GET | `/stops/:stopCode/vehicles` | Live vehicles approaching a stop |
| GET | `/stops/nearby?lat=&lon=&radius=` | Stops within `radius` meters (default 500, max 5000) |
| GET | `/search?q=` | Search lines by number/name and stops by name |

Most endpoints accept an optional `?date=DD/MM/YYYY` query parameter (defaults to today).

### Example responses

**GET /lines**
```json
[
  { "id": 1, "internalId": 21, "name": "Línea 1" },
  { "id": 2, "internalId": 22, "name": "Línea 2" }
]
```

**GET /lines/1/routes/1/stops**
```json
[
  { "code": 1001, "name": "Plaza del Rey" },
  { "code": 1002, "name": "Calle Real" }
]
```

**GET /lines/1/routes/1/schedule**
```json
{
  "lineId": 1,
  "routeId": 1,
  "routeName": "Circular",
  "fetchedAt": "2025-04-17T10:30:00.000Z",
  "stops": [
    {
      "order": 0,
      "code": 1001,
      "name": "Plaza del Rey",
      "lat": 36.471,
      "lon": -6.201,
      "arrival": { "raw": "5min", "type": "relative", "minutes": 5 }
    }
  ]
}
```

**GET /lines/1/routes/1/shape**
```json
{
  "routeId": 1,
  "routeName": "Circular",
  "source": "osrm",
  "points": [
    { "lat": 36.471, "lon": -6.201 },
    { "lat": 36.472, "lon": -6.202 }
  ]
}
```
`source` is `"osrm"` (road-snapped polyline) or `"stops"` (straight stop-to-stop fallback if OSRM is unavailable).

**GET /stops/nearby?lat=36.47&lon=-6.20&radius=300**
```json
[
  {
    "code": 1001,
    "name": "Plaza del Rey",
    "lat": 36.471,
    "lon": -6.201,
    "distanceMeters": 120,
    "routes": [
      { "lineId": 1, "routeId": 1, "routeName": "Circular" }
    ]
  }
]
```

**GET /search?q=plaza&lat=36.47&lon=-6.20**
```json
{
  "lines": [
    {
      "id": 1,
      "name": "Línea 1",
      "routes": [{ "id": 1, "name": "Circular" }]
    }
  ],
  "stops": [
    {
      "code": 1001,
      "name": "Plaza del Rey",
      "lat": 36.471,
      "lon": -6.201,
      "distanceMeters": 120,
      "routes": [{ "lineId": 1, "routeId": 1, "routeName": "Circular" }],
      "nextArrival": { "raw": "5min", "type": "relative", "minutes": 5 }
    }
  ]
}
```
`?lat=&lon=` is optional — omit to get `distanceMeters: 0`. `nextArrival` is `null` when no upcoming buses are found.

## Running locally

```bash
npm install
npm run dev       # start with hot reload
npm run build     # compile to dist/
npm start         # run compiled output
```

Server starts on `http://localhost:3000` by default. Override with the `PORT` environment variable.

## Production monitoring

`npm run monitor` checks the Railway production API. Override `API_BASE_URL`
to check another deployment. Run `npm run test:monitor` for offline checks.

The monitor runs only from 06:45 (inclusive) to 22:30 (exclusive) every day
in `Europe/Madrid`, with daylight-saving changes handled automatically.
Outside that window it exits successfully without making requests.

It discovers the first route on each of lines 1 and 2 and samples the first
and middle stops. HTTP failures, invalid responses, missing lines/routes/stops,
or empty arrivals at every sampled stop trigger up to two retries, one minute
apart. One empty stop is allowed. A persistent failure exits with status 1.
This detects widespread failures; it does not prove every stop is healthy.

On persistent failures with discovered stops, the monitor inspects the matching
upstream pages and logs timestamps, URLs, arrival counts, and errors:

- `upstream-rows-present`: upstream has table rows; investigate production or parsing.
- `upstream-empty`: the expected table exists but has no data rows.
- `upstream-markup-missing`: the expected table is absent; inspect for markup changes or an error page.
- `upstream-request-failed`: upstream could not be fetched successfully.

These are diagnostic clues from a later request, not proof of the original cause.
If discovery itself fails, the production error is logged without a stop comparison.

`.github/workflows/monitor.yml` schedules the check every 15 minutes and supports
manual runs. GitHub can delay scheduled runs, so this is best-effort monitoring.
The workflow must be on the default branch to run on schedule.
Enable GitHub Actions email or web notifications, optionally for failed workflows
only. Scheduled-run notifications go to the user who last changed the cron;
this setup does not add an email service or change account notification settings.
See [GitHub workflow notifications](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).

The daily `npm run smoke` workflow separately checks the scraper against upstream.

## Tech stack

- [Hono](https://hono.dev/) — lightweight TypeScript web framework
- [axios](https://axios-http.com/) — HTTP client
- [cheerio](https://cheerio.js.org/) — HTML/XML parsing
- [tsx](https://github.com/privatenumber/tsx) — TypeScript execution with hot reload

## AI coding assistants

Read [AGENTS.md](AGENTS.md) for shared project instructions, architecture, and verification commands. Edit that file when updating AI guidance. `CLAUDE.md` points to it for Claude Code.

If your assistant does not load `AGENTS.md` automatically, ask it to read the file before working. Optional task resources are linked from `AGENTS.md`.
