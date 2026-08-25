// @ts-nocheck
import { handleFetch } from "./site-lock-core.mjs";

function requestFromNode(req, body) {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
  const proto = String(
    req.headers["x-forwarded-proto"] ??
      (req.socket?.encrypted ? "https" : "http"),
  );
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const init = { method: req.method ?? "GET", headers };
  if (body !== undefined) init.body = body;
  return new Request(`${proto}://${host}${req.url ?? "/"}`, init);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function applyResponse(res, response) {
  res.statusCode = response.status;
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  for (const cookie of cookies) res.appendHeader("set-cookie", cookie);
  if (cookies.length === 0) {
    const single = response.headers.get("set-cookie");
    if (single) res.setHeader("set-cookie", single);
  }
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function siteLockPlugin() {
  return {
    name: "app-builder:site-lock",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const method = (req.method ?? "GET").toUpperCase();
          let body;
          if (method === "POST" || method === "PUT" || method === "PATCH") {
            body = (await readBody(req)).toString("utf8");
          }
          const request = requestFromNode(req, body);
          const result = await handleFetch(request, { allowVite: true });
          if (!result) {
            next();
            return;
          }
          await applyResponse(res, result);
        } catch (err) {
          console.error("[site-lock] middleware failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end("site lock failed");
          }
        }
      });
    },
  };
}
