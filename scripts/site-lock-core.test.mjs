import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handleFetch,
  makeToken,
  readCookie,
  timingSafeEqual,
  verifyToken,
} from "./site-lock-core.mjs";

describe("site-lock", () => {
  it("compares strings in constant time", () => {
    assert.equal(timingSafeEqual("barstool", "barstool"), true);
    assert.equal(timingSafeEqual("barstool", "Barstool"), false);
    assert.equal(timingSafeEqual("a", "aa"), false);
  });

  it("round-trips a signed token", async () => {
    const token = await makeToken();
    assert.equal(await verifyToken(token), true);
    assert.equal(await verifyToken("v1.1.deadbeef"), false);
    assert.equal(await verifyToken(""), false);
  });

  it("rejects expired tokens", async () => {
    const token = await makeToken(Date.now() - 40 * 24 * 60 * 60 * 1000);
    assert.equal(await verifyToken(token), false);
  });

  it("parses the site_lock cookie", () => {
    assert.equal(readCookie("a=1; site_lock=abc; b=2"), "abc");
    assert.equal(readCookie(""), "");
  });

  it("serves a login page to anonymous HTML visitors", async () => {
    const res = await handleFetch(
      new Request("http://localhost/", { headers: { accept: "text/html" } }),
    );
    assert.ok(res);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Log ind/);
    assert.match(html, /name="username"/);
  });

  it("blocks anonymous JS assets", async () => {
    const res = await handleFetch(new Request("http://localhost/assets/index.js"));
    assert.ok(res);
    assert.equal(res.status, 401);
  });

  it("accepts the configured credentials", async () => {
    const res = await handleFetch(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "username=barstool&password=Welcome04!",
        redirect: "manual",
      }),
    );
    assert.ok(res);
    assert.equal(res.status, 303);
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, /site_lock=/);
    assert.match(cookie, /HttpOnly/i);
  });

  it("rejects wrong passwords", async () => {
    const res = await handleFetch(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "username=barstool&password=wrong",
      }),
    );
    assert.ok(res);
    assert.equal(res.status, 401);
  });

  it("lets a valid session through", async () => {
    const token = await makeToken();
    const res = await handleFetch(
      new Request("http://localhost/assets/index.js", {
        headers: { cookie: `site_lock=${token}` },
      }),
    );
    assert.equal(res, null);
  });
});
