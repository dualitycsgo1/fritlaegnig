// @ts-nocheck
/**
 * Site-wide password gate. Runs on the server / Vercel Edge only.
 * Never import this module from client code.
 */

const COOKIE = "site_lock";
const TTL_SEC = 60 * 60 * 24 * 30;
const PEPPER = "fritlaegning-site-lock-v1";

function env(name, fallback) {
  try {
    const v = globalThis.process?.env?.[name];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    /* edge without process */
  }
  return fallback;
}

export function siteUser() {
  return env("SITE_LOCK_USER", "barstool");
}

export function sitePassword() {
  return env("SITE_LOCK_PASSWORD", "Welcome04!");
}

function secret() {
  return env("SITE_LOCK_SECRET", `${PEPPER}:${sitePassword()}`);
}

export function timingSafeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  const len = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(message, keyText) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

export async function makeToken(now = Date.now()) {
  const exp = now + TTL_SEC * 1000;
  const payload = `v1.${exp}`;
  const sig = await hmacHex(payload, secret());
  return `${payload}.${sig}`;
}

export async function verifyToken(token, now = Date.now()) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  const payload = `v1.${parts[1]}`;
  const expected = await hmacHex(payload, secret());
  return timingSafeEqual(parts[2], expected);
}

export function readCookie(header, name = COOKIE) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return "";
}

function cookieFlags(secure) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SEC}${secure ? "; Secure" : ""}`;
}

export function setCookieHeader(token, secure) {
  return `${COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(secure)}`;
}

export function clearCookieHeader(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function isViteInternal(path) {
  return (
    path.startsWith("/@") ||
    path.startsWith("/node_modules") ||
    path.startsWith("/.vite") ||
    path.startsWith("/__vite") ||
    path === "/__app-env"
  );
}

export function isPublicPath(path) {
  return path === "/favicon.svg";
}

function isAssetPath(path) {
  return (
    path.startsWith("/assets/") ||
    /\.(?:js|mjs|cjs|css|wasm|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|json|webmanifest)$/i.test(
      path,
    )
  );
}

function wantsHtml(request, path) {
  if (isAssetPath(path) && path !== "/login") return false;
  const accept = request.headers.get("accept") ?? "";
  if (!accept || accept.includes("text/html")) return true;
  return path === "/" || path === "/login";
}

function originOk(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function loginHtml(invalid) {
  const error = invalid
    ? `<p class="err">Forkert brugernavn eller adgangskode.</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Log ind · Fritlægning</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: Outfit, ui-sans-serif, system-ui, sans-serif;
      background: #0b0b12;
      color: #f0f0f5;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(100%, 380px);
      background: #12121c;
      border: 1px solid #2a2a3d;
      border-radius: 16px;
      padding: 28px 24px 24px;
    }
    .mark {
      width: 36px; height: 36px; border-radius: 8px;
      background: #e63e6d; color: #fff7f9;
      display: grid; place-items: center; margin-bottom: 16px;
    }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.02em; }
    .sub { color: #8e8ea0; font-size: 13px; margin: 0 0 20px; }
    label { display: block; font-size: 13px; color: #8e8ea0; margin: 0 0 6px; }
    input {
      width: 100%; height: 44px; border: 0; border-radius: 8px;
      background: #1a1a28; color: #f0f0f5; padding: 0 12px; font-size: 15px;
      box-shadow: 0 0 0 1px rgba(240,240,245,.1); outline: none;
    }
    input:focus { box-shadow: 0 0 0 2px #e63e6d; }
    .field { margin-bottom: 14px; }
    button {
      width: 100%; height: 44px; margin-top: 8px; border: 0; border-radius: 8px;
      background: #e63e6d; color: #fff7f9; font-size: 15px; font-weight: 600;
      cursor: pointer;
    }
    button:hover { filter: brightness(1.05); }
    .err { color: #f05252; font-size: 13px; margin: 0 0 12px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="mark" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="11" width="14" height="10" rx="2"/>
        <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
      </svg>
    </div>
    <h1>Fritlægning</h1>
    <p class="sub">Log ind for at fortsætte. Billeder forlader ikke din browser.</p>
    ${error}
    <form method="post" action="/login" autocomplete="on">
      <div class="field">
        <label for="username">Brugernavn</label>
        <input id="username" name="username" autocomplete="username" required autofocus />
      </div>
      <div class="field">
        <label for="password">Adgangskode</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <button type="submit">Log ind</button>
    </form>
  </main>
</body>
</html>`;
}

/**
 * @returns {Promise<Response | null>} A response to send, or null to continue.
 */
export async function handleFetch(request, { allowVite = false } = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = (request.method || "GET").toUpperCase();
  const secure = url.protocol === "https:";

  if (allowVite && isViteInternal(path)) return null;
  if (isPublicPath(path)) return null;

  if (path === "/logout" && (method === "GET" || method === "POST")) {
    return new Response(null, {
      status: 303,
      headers: {
        location: "/",
        "set-cookie": clearCookieHeader(secure),
        "cache-control": "no-store",
      },
    });
  }

  const token = readCookie(request.headers.get("cookie") ?? "");
  const authed = await verifyToken(token);

  if (authed && path === "/login" && method === "GET") {
    return new Response(null, { status: 303, headers: { location: "/" } });
  }

  if (method === "POST" && path === "/login") {
    if (!originOk(request)) {
      return new Response("Forbidden", { status: 403 });
    }
    let user = "";
    let pass = "";
    const ct = request.headers.get("content-type") ?? "";
    try {
      if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
        const fd = await request.formData();
        user = String(fd.get("username") ?? "");
        pass = String(fd.get("password") ?? "");
      } else {
        const text = await request.text();
        const params = new URLSearchParams(text);
        user = params.get("username") ?? "";
        pass = params.get("password") ?? "";
      }
    } catch {
      /* ignore parse */
    }
    const ok =
      timingSafeEqual(user, siteUser()) && timingSafeEqual(pass, sitePassword());
    if (ok) {
      const cookie = setCookieHeader(await makeToken(), secure);
      return new Response(null, {
        status: 303,
        headers: {
          location: "/",
          "set-cookie": cookie,
          "cache-control": "no-store",
        },
      });
    }
    return new Response(loginHtml(true), {
      status: 401,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (authed) return null;

  if (method === "GET" && wantsHtml(request, path)) {
    return new Response(loginHtml(false), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  return new Response("Unauthorized", {
    status: 401,
    headers: { "cache-control": "no-store" },
  });
}
