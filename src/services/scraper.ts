import axios, { AxiosError } from "axios";
import * as cheerio from "cheerio";
import type { BusLine, Route, Stop, BusTime, StopGeoPoint, RouteGeoData, Vehicle, StopVehicles, NearbyStop, StopRoute, ScheduleStop, RouteSchedule, RouteShape, ShapePoint } from "../types";
import { Cache } from "./cache";

const TTL_1HR = 60 * 60 * 1000;
const TTL_30S = 30 * 1000;

const linesCache = new Cache<string, BusLine[]>();
const routesCache = new Cache<number, Route[]>();
const stopsCache = new Cache<string, Stop[]>();
const geoDataCache = new Cache<string, RouteGeoData>();
const timesCache = new Cache<string, BusTime[]>();
const shapeCache = new Cache<string, RouteShape>();

const HOST = "http://77.224.241.76/sanfernando/mobile";
const SOAP_HOST = "http://77.224.241.76/sanfernando";
const LINES_URL = `${HOST}/lines.aspx`;
const ROUTES_URL = `${HOST}/routes.aspx`;
const STOPS_URL = `${HOST}/search.aspx`;
const TIMES_URL = `${HOST}/panel.aspx`;
const PRESENTER_URL = `${SOAP_HOST}/PresenterService.asmx`;
const SYNOPTIC_URL = `${SOAP_HOST}/SynopticState.asmx`;

const HEADERS = { "User-Agent": "Mozilla/5.0" };
const SOAP_HEADERS = {
  "Content-Type": "text/xml; charset=utf-8",
  "User-Agent": "Mozilla/5.0",
};

function todayFormatted(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function extractHiddenFields(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  return {
    __VIEWSTATE: $("#__VIEWSTATE").val() as string,
    __VIEWSTATEGENERATOR: $("#__VIEWSTATEGENERATOR").val() as string,
    __EVENTVALIDATION: $("#__EVENTVALIDATION").val() as string,
  };
}

async function resolveInternalId(
  buttonName: string,
  hiddenFields: Record<string, string>,
  t4: string
): Promise<number> {
  const params = new URLSearchParams({
    ...hiddenFields,
    [buttonName]: "Trayectos",
  });

  try {
    await axios.post(`${LINES_URL}?t4=${encodeURIComponent(t4)}`, params.toString(), {
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 0,
    });
    throw new Error("Expected redirect but got 200");
  } catch (err) {
    const axiosErr = err as AxiosError;
    if (axiosErr.response?.status === 302) {
      const location = axiosErr.response.headers["location"] as string;
      const match = location.match(/[?&]line=(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    throw new Error(`Failed to resolve internal ID for button ${buttonName}`);
  }
}

export async function fetchLines(date?: string): Promise<BusLine[]> {
  const t4 = date ?? todayFormatted();
  const cached = linesCache.get(t4);
  if (cached) return cached;

  const response = await axios.get(LINES_URL, {
    params: { t4 },
    headers: HEADERS,
  });

  const html = response.data as string;
  const $ = cheerio.load(html);
  const hiddenFields = extractHiddenFields(html);

  const rawLines: { id: number; name: string; buttonName: string }[] = [];

  $("table.table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const idText = cells.eq(0).text().trim();
    const name = cells.eq(1).text().trim();
    const buttonName = cells.eq(2).find("input[type=submit]").attr("name") ?? "";

    const id = parseInt(idText, 10);
    if (!isNaN(id) && name && buttonName) {
      rawLines.push({ id, name, buttonName });
    }
  });

  const internalIds = await Promise.all(
    rawLines.map((line) => resolveInternalId(line.buttonName, hiddenFields, t4))
  );

  const result = rawLines.map((line, i) => ({
    id: line.id,
    internalId: internalIds[i],
    name: line.name,
  }));
  linesCache.set(t4, result, TTL_1HR);
  return result;
}

export async function fetchRoutes(internalId: number): Promise<Route[]> {
  const cached = routesCache.get(internalId);
  if (cached) return cached;

  const response = await axios.get(ROUTES_URL, {
    params: { line: internalId },
    headers: HEADERS,
  });

  const $ = cheerio.load(response.data as string);
  const routes: Route[] = [];

  $("table.table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    // first td is hidden (contains internal IDs), second has the name
    const name = cells.filter((_, td) => $(td).css("display") !== "none").first().text().trim();
    const routeIdText = cells.find("span[id*='lbliIdTrayecto']").text().trim();

    const id = parseInt(routeIdText, 10);
    if (!isNaN(id) && name) {
      routes.push({ id, name });
    }
  });

  routesCache.set(internalId, routes, TTL_1HR);
  return routes;
}

export async function fetchStops(internalLineId: number, routeId: number): Promise<Stop[]> {
  const key = `${internalLineId}:${routeId}`;
  const cached = stopsCache.get(key);
  if (cached) return cached;

  const route = `${internalLineId}${String(routeId).padStart(4, "0")}`;

  const response = await axios.get(STOPS_URL, {
    params: { route },
    headers: HEADERS,
  });

  const $ = cheerio.load(response.data as string);
  const stops: Stop[] = [];

  $("table.table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const codeText = cells.eq(0).text().trim();
    const name = cells.eq(1).text().trim();

    const code = parseInt(codeText, 10);
    if (!isNaN(code) && name) {
      stops.push({ code, name });
    }
  });

  stopsCache.set(key, stops, TTL_1HR);
  return stops;
}

export async function fetchTimes(
  stopCode: number,
  internalLineId: number,
  routeId: number
): Promise<BusTime[]> {
  const key = `${stopCode}:${internalLineId}:${routeId}`;
  const cached = timesCache.get(key);
  if (cached) return cached;

  const route = `${internalLineId}${String(routeId).padStart(4, "0")}`;

  const response = await axios.get(TIMES_URL, {
    params: { stop: stopCode, route },
    headers: HEADERS,
  });

  const $ = cheerio.load(response.data as string);
  const times: BusTime[] = [];

  $("table.tablePanel tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const lineText = cells.eq(0).text().trim();
    const destination = cells.eq(1).text().trim();
    const arrival = cells.eq(2).text().trim();

    const line = parseInt(lineText, 10);
    if (!isNaN(line) && destination && arrival) {
      times.push({ line, destination, arrival });
    }
  });

  timesCache.set(key, times, TTL_30S);
  return times;
}

async function fetchStopCoords(
  stopCode: number
): Promise<{ lat: number; lon: number } | null> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetParada xmlns="http://tempuri.org/">
      <iIdParada>${stopCode}</iIdParada>
    </GetParada>
  </soap:Body>
</soap:Envelope>`;

  const response = await axios.post(PRESENTER_URL, body, {
    headers: { ...SOAP_HEADERS, SOAPAction: '"http://tempuri.org/GetParada"' },
  });

  const $ = cheerio.load(response.data as string, { xmlMode: true });
  const lat = parseFloat($("dLat").first().text());
  const lon = parseFloat($("dLong").first().text());

  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat, lon };
}

export async function fetchRouteGeoData(
  internalLineId: number,
  routeId: number,
  routeName: string
): Promise<RouteGeoData> {
  const key = `${internalLineId}:${routeId}`;
  const cached = geoDataCache.get(key);
  if (cached) return cached;

  const stops = await fetchStops(internalLineId, routeId);

  const coordResults = await Promise.all(
    stops.map((stop) => fetchStopCoords(stop.code))
  );

  const geoStops: StopGeoPoint[] = stops
    .map((stop, i) => {
      const coords = coordResults[i];
      if (!coords) return null;
      return { code: stop.code, name: stop.name, order: i, ...coords };
    })
    .filter((s): s is StopGeoPoint => s !== null);

  const result = { routeId, routeName, stops: geoStops };
  geoDataCache.set(key, result, TTL_1HR);
  return result;
}

const OSRM_URL = "http://router.project-osrm.org/route/v1/driving";

export async function fetchRouteShape(
  internalLineId: number,
  routeId: number,
  routeName: string
): Promise<RouteShape> {
  const key = `${internalLineId}:${routeId}`;
  const cached = shapeCache.get(key);
  if (cached) return cached;

  const geoData = await fetchRouteGeoData(internalLineId, routeId, routeName);

  // If the route is circular (stops repeat on the return leg), only use the outbound half
  const seen = new Set<number>();
  const outboundStops = geoData.stops.filter((s) => {
    if (seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  });

  const stopPoints = outboundStops.map(({ lat, lon }) => ({ lat, lon }));

  if (stopPoints.length >= 2) {
    try {
      const coords = outboundStops.map((s) => `${s.lon},${s.lat}`).join(";");
      const response = await axios.get(`${OSRM_URL}/${coords}`, {
        params: { overview: "full", geometries: "geojson" },
        headers: HEADERS,
      });

      const coordinates = (response.data as any).routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
      if (coordinates && coordinates.length > 0) {
        const points: ShapePoint[] = coordinates.map(([lon, lat]) => ({ lat, lon }));
        const result: RouteShape = { routeId, routeName, source: "osrm", points };
        shapeCache.set(key, result, TTL_1HR);
        return result;
      }
    } catch {}
  }

  const result: RouteShape = { routeId, routeName, source: "stops", points: stopPoints };
  shapeCache.set(key, result, TTL_1HR);
  return result;
}

export async function fetchVehiclesForStop(stopCode: number): Promise<StopVehicles> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <getVehiculos xmlns="http://tempuri.org/">
      <iIdParada>${stopCode}</iIdParada>
    </getVehiculos>
  </soap:Body>
</soap:Envelope>`;

  const response = await axios.post(SYNOPTIC_URL, body, {
    headers: { ...SOAP_HEADERS, SOAPAction: '"http://tempuri.org/getVehiculos"' },
  });

  const $ = cheerio.load(response.data as string, { xmlMode: true });
  const vehicles: Vehicle[] = [];

  $("JSonPosicion").each((_, el) => {
    const lat = parseFloat($(el).find("dLat").text());
    const lon = parseFloat($(el).find("dLon").text());
    if (isNaN(lat) || isNaN(lon)) return;

    vehicles.push({
      vehicleId: $(el).find("vehiculo").text().trim(),
      lineId: parseInt($(el).find("linea").text(), 10),
      routeId: parseInt($(el).find("trayecto").text(), 10),
      direction: $(el).find("sentido").text().trim(),
      origin: $(el).find("origen").text().trim(),
      destination: $(el).find("destino").text().trim(),
      distanceMeters: parseFloat($(el).find("distanciaParada").text()),
      speedKmh: parseFloat($(el).find("velocidad").text()),
      delayMinutes: parseFloat($(el).find("retraso").text()) || 0,
      status: $(el).find("estado").text().trim(),
      lat,
      lon,
    });
  });

  return { stopCode, vehicles };
}

// --- Nearby stops ---

type StopCacheEntry = NearbyStop;
let allStopsCache: StopCacheEntry[] | null = null;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchAllStopsWithCoords(): Promise<StopCacheEntry[]> {
  if (allStopsCache) return allStopsCache;

  const lines = await fetchLines();

  // Fetch all routes for all lines in parallel
  const routesByLine = await Promise.all(
    lines.map(async (line) => ({
      lineId: line.id,
      internalId: line.internalId,
      routes: await fetchRoutes(line.internalId),
    }))
  );

  // Collect route info per stop, deduplicating by stop code + route key
  const stopMap = new Map<number, { name: string; routes: Map<string, StopRoute> }>();

  await Promise.all(
    routesByLine.flatMap(({ lineId, internalId, routes }) =>
      routes.map(async (route) => {
        const stops = await fetchStops(internalId, route.id);
        for (const stop of stops) {
          const routeKey = `${lineId}:${route.id}`;
          const routeEntry: StopRoute = { lineId, routeId: route.id, routeName: route.name };
          const entry = stopMap.get(stop.code);
          if (entry) {
            entry.routes.set(routeKey, routeEntry);
          } else {
            stopMap.set(stop.code, { name: stop.name, routes: new Map([[routeKey, routeEntry]]) });
          }
        }
      })
    )
  );

  // Fetch coordinates for all unique stops in parallel
  const codes = Array.from(stopMap.keys());
  const coords = await Promise.all(codes.map((code) => fetchStopCoords(code)));

  allStopsCache = codes
    .map((code, i) => {
      const c = coords[i];
      if (!c) return null;
      const entry = stopMap.get(code)!;
      return {
        code,
        name: entry.name,
        lat: c.lat,
        lon: c.lon,
        distanceMeters: 0,
        routes: Array.from(entry.routes.values()).sort((a, b) => a.lineId - b.lineId || a.routeId - b.routeId),
      };
    })
    .filter((s): s is StopCacheEntry => s !== null);

  return allStopsCache;
}

export async function fetchRouteSchedule(
  lineId: number,
  internalLineId: number,
  routeId: number,
  routeName: string
): Promise<RouteSchedule> {
  const [stops, geoData] = await Promise.all([
    fetchStops(internalLineId, routeId),
    fetchRouteGeoData(internalLineId, routeId, routeName),
  ]);

  const coordsByCode = new Map(geoData.stops.map((s) => [s.code, { lat: s.lat, lon: s.lon }]));

  const timesPerStop = await Promise.all(
    stops.map((stop) => fetchTimes(stop.code, internalLineId, routeId))
  );

  const scheduleStops: ScheduleStop[] = stops.map((stop, i) => {
    const coords = coordsByCode.get(stop.code) ?? null;
    const match = timesPerStop[i].find((t) => t.line === lineId) ?? null;

    let arrival: ScheduleStop["arrival"] = null;
    if (match) {
      const relMatch = match.arrival.match(/^(\d+)min$/i);
      if (relMatch) {
        arrival = { raw: match.arrival, type: "relative", minutes: parseInt(relMatch[1], 10) };
      } else {
        arrival = { raw: match.arrival, type: "absolute", minutes: null };
      }
    }

    return { order: i, code: stop.code, name: stop.name, lat: coords?.lat ?? null, lon: coords?.lon ?? null, arrival };
  });

  return { lineId, routeId, routeName, fetchedAt: new Date().toISOString(), stops: scheduleStops };
}

export async function searchStops(query: string): Promise<NearbyStop[]> {
  const all = await fetchAllStopsWithCoords();
  const q = query.toLowerCase();
  return all.filter((s) => s.name.toLowerCase().includes(q));
}

export async function fetchNearbyStops(
  lat: number,
  lon: number,
  radiusMeters: number
): Promise<NearbyStop[]> {
  const all = await fetchAllStopsWithCoords();

  return all
    .map((stop) => ({
      ...stop,
      distanceMeters: Math.round(haversineMeters(lat, lon, stop.lat, stop.lon)),
    }))
    .filter((stop) => stop.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
