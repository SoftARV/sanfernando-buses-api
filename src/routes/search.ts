import { Hono } from "hono";
import { fetchLines, searchStops } from "../services/scraper";

const search = new Hono();

search.get("/", async (c) => {
  const q = c.req.query("q")?.trim();

  if (!q || q.length < 1) {
    return c.json({ error: "Query parameter 'q' is required." }, 400);
  }

  const [allLines, stops] = await Promise.all([
    fetchLines(),
    searchStops(q),
  ]);

  const isNumeric = /^\d+$/.test(q);
  const lines = allLines
    .filter((l) =>
      isNumeric
        ? l.id === parseInt(q, 10)
        : l.name.toLowerCase().includes(q.toLowerCase())
    )
    .map(({ id, name }) => ({ id, name }));

  return c.json({ lines, stops });
});

export default search;
