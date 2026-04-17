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
| GET | `/lines/:id/routes/:routeId/schedule` | Next arrival at every stop on the route |
| GET | `/stops/:stopCode/vehicles` | Live vehicles approaching a stop |
| GET | `/stops/nearby?lat=&lon=&radius=` | Stops within `radius` meters (default 500, max 5000) |

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
      "arrival": { "raw": "5min", "type": "relative", "minutes": 5 }
    }
  ]
}
```

**GET /stops/nearby?lat=36.47&lon=-6.20&radius=300**
```json
[
  {
    "code": 1001,
    "name": "Plaza del Rey",
    "lat": 36.471,
    "lon": -6.201,
    "distanceMeters": 120,
    "lineIds": [1, 2]
  }
]
```

## Running locally

```bash
npm install
npm run dev       # start with hot reload
npm run build     # compile to dist/
npm start         # run compiled output
```

Server starts on `http://localhost:3000` by default. Override with the `PORT` environment variable.

## Tech stack

- [Hono](https://hono.dev/) — lightweight TypeScript web framework
- [axios](https://axios-http.com/) — HTTP client
- [cheerio](https://cheerio.js.org/) — HTML/XML parsing
- [tsx](https://github.com/privatenumber/tsx) — TypeScript execution with hot reload
