#!/usr/bin/env node
/**
 * After the Nitro/Vercel build, inject Edge middleware that gates every
 * request — including CDN static assets — behind the site password.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, ".vercel/output");
const FUNC = join(OUTPUT, "functions/site-lock.func");
const CONFIG = join(OUTPUT, "config.json");
const CORE = join(ROOT, "scripts/site-lock-core.mjs");

if (!existsSync(CONFIG)) {
  console.error("[site-lock] .vercel/output/config.json missing — skip");
  process.exit(0);
}

const core = readFileSync(CORE, "utf8").replaceAll(
  "export ",
  "",
);

mkdirSync(FUNC, { recursive: true });
writeFileSync(
  join(FUNC, "index.js"),
  `${core}

export default async function middleware(request) {
  const result = await handleFetch(request);
  if (result) return result;
  return new Response(null, {
    headers: { "x-middleware-next": "1" },
  });
}
`,
);
writeFileSync(
  join(FUNC, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "edge",
      entrypoint: "index.js",
      deploymentTarget: "v8-worker",
    },
    null,
    2,
  ),
);

const config = JSON.parse(readFileSync(CONFIG, "utf8"));
config.routes = Array.isArray(config.routes) ? config.routes : [];
config.routes = config.routes.filter((r) => r.middlewarePath !== "site-lock");
config.routes.unshift({
  src: "/(.*)",
  middlewarePath: "site-lock",
  continue: true,
  override: true,
});
writeFileSync(CONFIG, JSON.stringify(config, null, 2));
console.log("[site-lock] attached Edge middleware to Vercel output");
