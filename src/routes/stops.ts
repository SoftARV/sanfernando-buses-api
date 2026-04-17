import { Hono } from "hono";
import { fetchVehiclesForStop, fetchNearbyStops } from "../services/scraper";

const stops = new Hono();

stops.get("/nearby", async (c) => {
  const lat = parseFloat(c.req.query("lat") ?? "");
  const lon = parseFloat(c.req.query("lon") ?? "");
  const radius = Math.min(parseInt(c.req.query("radius") ?? "500", 10), 5000);

  if (isNaN(lat) || isNaN(lon)) {
    return c.json({ error: "lat and lon are required." }, 400);
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return c.json({ error: "Invalid coordinates." }, 400);
  }

  const nearby = await fetchNearbyStops(lat, lon, isNaN(radius) ? 500 : radius);
  return c.json(nearby);
});

stops.get("/:stopCode/vehicles", async (c) => {
  const stopCode = parseInt(c.req.param("stopCode"), 10);
  if (isNaN(stopCode)) {
    return c.json({ error: "Invalid stop code." }, 400);
  }

  const data = await fetchVehiclesForStop(stopCode);
  return c.json(data);
});

export default stops;
