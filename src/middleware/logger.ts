import type { MiddlewareHandler } from "hono";

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const status = c.res.status;
    console.log(JSON.stringify({
      level: status >= 500 ? "error" : "info",
      time: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Date.now() - start,
    }));
  };
}
