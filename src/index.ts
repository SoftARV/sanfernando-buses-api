import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isAxiosError } from "axios";
import lines from "./routes/lines";
import stops from "./routes/stops";
import search from "./routes/search";
import { AppError } from "./utils/errors";
import { fetchAllStopsWithCoords } from "./services/scraper";
import { requestLogger } from "./middleware/logger";

const app = new Hono();

app.use("*", cors({ origin: "*", allowMethods: ["GET"] }));
app.use("*", requestLogger());

app.route("/lines", lines);
app.route("/stops", stops);
app.route("/search", search);

app.notFound((c) => c.json({ error: "Not found." }, 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.statusCode as 400 | 404 | 500);
  }

  if (isAxiosError(err)) {
    if (!err.response) {
      return c.json({ error: "Upstream service unavailable." }, 503);
    }
    return c.json({ error: "Upstream returned an error." }, 502);
  }

  console.log(JSON.stringify({
    level: "error",
    time: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
  }));
  return c.json({ error: "Internal server error." }, 500);
});

const PORT = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), msg: `Server running on port ${PORT}` }));
  fetchAllStopsWithCoords().catch((err) =>
    console.log(JSON.stringify({ level: "error", time: new Date().toISOString(), msg: "Stop cache warm-up failed", error: (err as Error).message }))
  );
});
