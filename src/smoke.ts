/**
 * Upstream smoke test / drift detector.
 *
 * Exercises the real scraper end-to-end against the live upstream and asserts
 * that each step extracts actual data. The legacy ASP.NET site never returns an
 * error when its markup changes — it returns a healthy 200 that our selectors no
 * longer match — so the signal we watch for is "200 OK but 0 rows parsed".
 *
 * IDs are discovered dynamically (first line -> its first route -> its first
 * stop), so the test adapts automatically as lines come and go (e.g. the summer
 * beach line). Run manually with `npm run smoke`; exit code is 1 if any HARD
 * check failed, so it can gate a cron job or CI step.
 */
import {
  fetchLines,
  fetchRoutes,
  fetchStops,
  fetchTimes,
  fetchRouteGeoData,
  fetchVehiclesForStop,
  fetchAllStopsWithCoords,
} from "./services/scraper";
import type { BusLine } from "./types";

type Severity = "HARD" | "SOFT";

interface Result {
  name: string;
  severity: Severity;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];

function record(name: string, severity: Severity, ok: boolean, detail: string): void {
  results.push({ name, severity, ok, detail });
}

/** Run a check; a thrown error is a failure with the thrown message. */
async function check(
  name: string,
  severity: Severity,
  fn: () => Promise<{ ok: boolean; detail: string }>
): Promise<{ ok: boolean; detail: string } | null> {
  try {
    const outcome = await fn();
    record(name, severity, outcome.ok, outcome.detail);
    return outcome;
  } catch (err) {
    record(name, severity, false, `threw: ${(err as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  // 1. Lines list + implicit 302 internal-ID redirect (fetchLines resolves IDs
  //    via the POST->302 mechanism, so a broken redirect surfaces as 0 lines).
  let lines: BusLine[] = [];
  try {
    lines = await fetchLines();
    record("lines", "HARD", lines.length > 0, `${lines.length} lines (${lines.map((x) => x.id).join(", ")})`);
  } catch (err) {
    record("lines", "HARD", false, `threw: ${(err as Error).message}`);
  }
  if (lines.length === 0) return;
  const line = lines[0];

  // 2. Routes for the first line.
  const routes = await fetchRoutes(line.internalId).catch(() => []);
  record("routes", "HARD", routes.length > 0, `line ${line.id} -> ${routes.length} routes`);
  if (routes.length === 0) return;
  const route = routes[0];

  // 3. Stops for the first route.
  const stops = await fetchStops(line.internalId, route.id).catch(() => []);
  record("stops", "HARD", stops.length > 0, `line ${line.id} route ${route.id} -> ${stops.length} stops`);
  if (stops.length === 0) return;
  const stop = stops[0];

  // 4. Stop coordinates via SOAP GetParada (geoData keeps only geocoded stops).
  await check("coordinates", "HARD", async () => {
    const geo = await fetchRouteGeoData(line.internalId, route.id, route.name);
    return {
      ok: geo.stops.length > 0,
      detail: `${geo.stops.length}/${stops.length} stops geocoded`,
    };
  });

  // 5. Arrival times panel. Legitimately empty outside service hours, so SOFT —
  //    but a thrown error (structure change) still counts as a failure.
  await check("arrivals", "SOFT", async () => {
    const times = await fetchTimes(stop.code, line.internalId, route.id);
    return {
      ok: true,
      detail: `stop ${stop.code} -> ${times.length} arrivals` + (times.length ? ` (next: ${times[0].arrival})` : " (none right now)"),
    };
  });

  // 6. Live vehicles. Upstream GPS is known-dead -> expected empty, SOFT.
  await check("vehicles", "SOFT", async () => {
    const v = await fetchVehiclesForStop(stop.code);
    return { ok: true, detail: `stop ${stop.code} -> ${v.vehicles.length} live vehicles` };
  });

  // 7. Aggregate stop cache (powers /search and /nearby) across ALL lines.
  await check("stop-cache", "HARD", async () => {
    const all = await fetchAllStopsWithCoords();
    return { ok: all.length > 0, detail: `${all.length} stops cached across all lines` };
  });
}

function report(): number {
  const pad = Math.max(...results.map((r) => r.name.length));
  console.log(`\nUpstream smoke test — ${new Date().toISOString()}`);
  console.log("─".repeat(52));
  for (const r of results) {
    const status = r.ok ? "PASS" : r.severity === "HARD" ? "FAIL" : "WARN";
    console.log(`${status}  ${r.name.padEnd(pad)}  ${r.detail}`);
  }
  const hardFails = results.filter((r) => !r.ok && r.severity === "HARD").length;
  const softWarns = results.filter((r) => !r.ok && r.severity === "SOFT").length;
  const pass = results.filter((r) => r.ok).length;
  console.log("─".repeat(52));
  console.log(`${results.length} checks · ${pass} pass · ${softWarns} warn · ${hardFails} fail\n`);
  return hardFails;
}

main()
  .catch((err) => {
    record("fatal", "HARD", false, `unhandled: ${(err as Error).message}`);
  })
  .finally(() => {
    const hardFails = report();
    process.exit(hardFails > 0 ? 1 : 0);
  });
