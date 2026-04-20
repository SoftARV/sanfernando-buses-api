import { Hono } from "hono";
import { fetchLines, fetchRoutes, fetchTimes, searchStops, haversineMeters, parseArrival } from "../services/scraper";
import { ParsedArrival } from "../types";

const search = new Hono();

search.get("/", async (c) => {
  const q = c.req.query("q")?.trim();

  if (!q || q.length < 1) {
    return c.json({ error: "Query parameter 'q' is required." }, 400);
  }

  const rawLat = c.req.query("lat");
  const rawLon = c.req.query("lon");
  const lat = rawLat !== undefined ? parseFloat(rawLat) : NaN;
  const lon = rawLon !== undefined ? parseFloat(rawLon) : NaN;
  const hasCoords = !isNaN(lat) && !isNaN(lon);

  const [allLines, stops] = await Promise.all([
    fetchLines(),
    searchStops(q),
  ]);

  const internalIdByLineId = new Map(allLines.map((l) => [l.id, l.internalId]));

  const isNumeric = /^\d+$/.test(q);
  const matchedLines = allLines.filter((l) =>
    isNumeric
      ? l.id === parseInt(q, 10)
      : l.name.toLowerCase().includes(q.toLowerCase())
  );

  const [lines, enrichedStops] = await Promise.all([
    Promise.all(
      matchedLines.map(async ({ id, name, internalId }) => ({
        id,
        name,
        routes: await fetchRoutes(internalId),
      }))
    ),
    Promise.all(
      stops.map(async (stop) => {
        const arrivals = await Promise.all(
          stop.routes.map(async (route) => {
            const internalId = internalIdByLineId.get(route.lineId);
            if (internalId === undefined) return null;
            const times = await fetchTimes(stop.code, internalId, route.routeId);
            return times[0] ? parseArrival(times[0].arrival) : null;
          })
        );

        const relative = arrivals
          .filter((a): a is ParsedArrival => a !== null && a.type === "relative" && a.minutes !== null)
          .sort((a: ParsedArrival, b: ParsedArrival) => (a.minutes as number) - (b.minutes as number));

        const nextArrival: ParsedArrival | null =
          relative[0] ?? arrivals.find((a): a is ParsedArrival => a !== null) ?? null;

        return {
          ...stop,
          distanceMeters: hasCoords ? Math.round(haversineMeters(lat, lon, stop.lat, stop.lon)) : 0,
          nextArrival,
        };
      })
    ),
  ]);

  return c.json({ lines, stops: enrichedStops });
});

export default search;
