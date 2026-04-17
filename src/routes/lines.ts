import { Hono } from "hono";
import { fetchLines, fetchRoutes, fetchStops, fetchTimes, fetchRouteGeoData, fetchRouteSchedule } from "../services/scraper";

const lines = new Hono();

lines.get("/", async (c) => {
  const date = c.req.query("date");

  if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return c.json({ error: "Invalid date format. Use DD/MM/YYYY." }, 400);
  }

  const data = await fetchLines(date);
  return c.json(data);
});

lines.get("/:id/routes", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid line id." }, 400);
  }

  const date = c.req.query("date");
  if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return c.json({ error: "Invalid date format. Use DD/MM/YYYY." }, 400);
  }

  const allLines = await fetchLines(date);
  const line = allLines.find((l) => l.id === id);

  if (!line) {
    return c.json({ error: `Line ${id} not found.` }, 404);
  }

  const routes = await fetchRoutes(line.internalId);
  return c.json(routes);
});

lines.get("/:id/routes/:routeId/stops", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const routeId = parseInt(c.req.param("routeId"), 10);

  if (isNaN(id)) return c.json({ error: "Invalid line id." }, 400);
  if (isNaN(routeId)) return c.json({ error: "Invalid route id." }, 400);

  const date = c.req.query("date");
  if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return c.json({ error: "Invalid date format. Use DD/MM/YYYY." }, 400);
  }

  const allLines = await fetchLines(date);
  const line = allLines.find((l) => l.id === id);
  if (!line) return c.json({ error: `Line ${id} not found.` }, 404);

  const routes = await fetchRoutes(line.internalId);
  const route = routes.find((r) => r.id === routeId);
  if (!route) return c.json({ error: `Route ${routeId} not found on line ${id}.` }, 404);

  const stops = await fetchStops(line.internalId, route.id);
  return c.json(stops);
});

lines.get("/:id/routes/:routeId/stops/:stopCode/times", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const routeId = parseInt(c.req.param("routeId"), 10);
  const stopCode = parseInt(c.req.param("stopCode"), 10);

  if (isNaN(id)) return c.json({ error: "Invalid line id." }, 400);
  if (isNaN(routeId)) return c.json({ error: "Invalid route id." }, 400);
  if (isNaN(stopCode)) return c.json({ error: "Invalid stop code." }, 400);

  const date = c.req.query("date");
  if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return c.json({ error: "Invalid date format. Use DD/MM/YYYY." }, 400);
  }

  const allLines = await fetchLines(date);
  const line = allLines.find((l) => l.id === id);
  if (!line) return c.json({ error: `Line ${id} not found.` }, 404);

  const routes = await fetchRoutes(line.internalId);
  const route = routes.find((r) => r.id === routeId);
  if (!route) return c.json({ error: `Route ${routeId} not found on line ${id}.` }, 404);

  const times = await fetchTimes(stopCode, line.internalId, route.id);
  return c.json(times);
});

lines.get("/:id/routes/:routeId/geodata", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const routeId = parseInt(c.req.param("routeId"), 10);

  if (isNaN(id)) return c.json({ error: "Invalid line id." }, 400);
  if (isNaN(routeId)) return c.json({ error: "Invalid route id." }, 400);

  const date = c.req.query("date");
  if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return c.json({ error: "Invalid date format. Use DD/MM/YYYY." }, 400);
  }

  const allLines = await fetchLines(date);
  const line = allLines.find((l) => l.id === id);
  if (!line) return c.json({ error: `Line ${id} not found.` }, 404);

  const routes = await fetchRoutes(line.internalId);
  const route = routes.find((r) => r.id === routeId);
  if (!route) return c.json({ error: `Route ${routeId} not found on line ${id}.` }, 404);

  const geoData = await fetchRouteGeoData(line.internalId, route.id, route.name);
  return c.json(geoData);
});

lines.get("/:id/routes/:routeId/schedule", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const routeId = parseInt(c.req.param("routeId"), 10);

  if (isNaN(id)) return c.json({ error: "Invalid line id." }, 400);
  if (isNaN(routeId)) return c.json({ error: "Invalid route id." }, 400);

  const date = c.req.query("date");
  if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return c.json({ error: "Invalid date format. Use DD/MM/YYYY." }, 400);
  }

  const allLines = await fetchLines(date);
  const line = allLines.find((l) => l.id === id);
  if (!line) return c.json({ error: `Line ${id} not found.` }, 404);

  const routes = await fetchRoutes(line.internalId);
  const route = routes.find((r) => r.id === routeId);
  if (!route) return c.json({ error: `Route ${routeId} not found on line ${id}.` }, 404);

  const schedule = await fetchRouteSchedule(line.id, line.internalId, route.id, route.name);
  return c.json(schedule);
});

export default lines;
