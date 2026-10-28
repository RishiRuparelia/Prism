import test from "node:test";
import assert from "node:assert/strict";
import { handleBareRequest, isPublicAddress, validateTarget } from "../worker/proxy.ts";

const site = "https://rooster.example.org";
function request(target = "https://example.com/page", { method = "GET", headers = {}, body, bareHeaders = {} } = {}) {
  return new Request(`${site}/bare/v3/`, {
    method,
    headers: { "x-bare-url": target, "x-bare-headers": JSON.stringify(bareHeaders), ...headers },
    ...(body === undefined ? {} : { body }),
  });
}
function transport(remote, addresses = ["93.184.215.14"]) {
  const calls = [];
  const fetcher = async (url, init) => {
    const target = new URL(url);
    if (target.hostname === "cloudflare-dns.com") {
      assert.equal(init.redirect, "manual", "The Worker runtime supports follow/manual redirect modes only.");
      return Response.json({ Status: 0, Answer: target.searchParams.get("type") === "A" ? addresses.map((data) => ({ type: 1, data })) : [] });
    }
    calls.push({ target, init });
    return typeof remote === "function" ? remote(target, init) : remote;
  };
  return { fetcher, calls };
}
function metadata(headers) {
  if (headers.has("x-bare-headers")) return JSON.parse(headers.get("x-bare-headers"));
  let value = "";
  for (let i = 0; headers.has(`x-bare-headers-${i}`); i++) value += headers.get(`x-bare-headers-${i}`).slice(1);
  return JSON.parse(value);
}

test("publishes a Bare v3 manifest and handles preflight", async () => {
  const info = await handleBareRequest(new Request(`${site}/bare/`));
  assert.deepEqual((await info.json()).versions, ["v3"]);
  const preflight = await handleBareRequest(new Request(`${site}/bare/v3/`, { method: "OPTIONS", headers: { "access-control-request-headers": "x-bare-url,x-bare-headers" } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.match(preflight.headers.get("access-control-allow-headers"), /x-bare-url/);
});

test("blocks canonicalized private addresses, reserved IPv6, and self recursion before fetching", async () => {
  let fetched = false;
  const fetcher = async () => { fetched = true; throw new Error("must not fetch"); };
  for (const url of ["http://127.1/", "http://2130706433/", "http://0x7f000001/", "http://10.0.0.1/", "http://100.64.1.1/", "http://169.254.169.254/", "http://[::1]/", "http://[::ffff:7f00:1]/", "http://[2001:db8::1]/", "http://[2::1]/", "http://localhost./", "http://printer.local/", `${site}/`, "https://example.com:8443/"]) {
    const response = await handleBareRequest(request(url), fetcher);
    assert.equal(response.status, 403, url);
  }
  assert.equal(fetched, false);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("2001:0002::1"), false);
  assert.equal(isPublicAddress("2606:garbage"), false);
  assert.throws(() => validateTarget("file:///etc/passwd", new URL(site)));
  assert.throws(() => validateTarget("https://me:secret@example.com", new URL(site)));
});

test("DNS verification rejects hostnames resolving to private addresses", async () => {
  const { fetcher, calls } = transport(new Response("unreachable"), ["192.168.1.1"]);
  const response = await handleBareRequest(request(), fetcher);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "TARGET_BLOCKED");
  assert.equal(calls.length, 0);
});

test("forwards a POST body, strips hop headers, and preserves redirects as Bare metadata", async () => {
  const { fetcher, calls } = transport(new Response("redirect body", { status: 302, statusText: "Found", headers: { location: "http://127.0.0.1/", "set-cookie": "session=abc; HttpOnly" } }));
  const response = await handleBareRequest(request(undefined, { method: "POST", body: "hello", headers: { cookie: "hostsession=secret", authorization: "Bearer hostsecret", "oai-authenticated-user-id": "host-user", "x-bare-forward-headers": "cookie, authorization, oai-authenticated-user-id" }, bareHeaders: { "Content-Type": "text/plain", Cookie: ["a=1", "b=2"], Connection: "x-hop", "x-hop": "drop", Authorization: "Bearer token" } }), fetcher);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-bare-status"), "302");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  const remote = metadata(response.headers);
  assert.equal(remote.location, "http://127.0.0.1/");
  assert.deepEqual(remote["set-cookie"], ["session=abc; HttpOnly"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.headers.get("connection"), null);
  assert.equal(calls[0].init.headers.get("x-hop"), null);
  assert.equal(calls[0].init.headers.get("cookie"), "a=1; b=2");
  assert.equal(calls[0].init.headers.get("authorization"), "Bearer token");
  assert.equal(calls[0].init.headers.get("oai-authenticated-user-id"), null);
  assert.equal(await new Response(calls[0].init.body).text(), "hello");
  assert.equal(await response.text(), "redirect body");
});

test("joins split request headers and splits large response metadata losslessly", async () => {
  const large = "value".repeat(1600);
  const { fetcher, calls } = transport(new Response("ok", { headers: { "x-large": large } }));
  const req = request();
  req.headers.delete("x-bare-headers");
  req.headers.set("x-bare-headers-1", ';"example"}');
  req.headers.set("x-bare-headers-0", ';{"User-Agent":');
  const response = await handleBareRequest(req, fetcher);
  assert.equal(response.status, 200);
  assert.equal(calls[0].init.headers.get("user-agent"), "example");
  assert.equal(response.headers.get("x-bare-headers"), null);
  assert.equal(metadata(response.headers)["x-large"], large);
  assert.equal(await response.text(), "ok");
});

test("rejects malformed header JSON and missing split fragments", async () => {
  const { fetcher, calls } = transport(new Response("never"));
  const malformed = request();
  malformed.headers.set("x-bare-headers", '{"oops": 123}');
  assert.equal((await handleBareRequest(malformed, fetcher)).status, 400);
  const split = request();
  split.headers.delete("x-bare-headers");
  split.headers.set("x-bare-headers-1", ";{}");
  assert.equal((await handleBareRequest(split, fetcher)).status, 400);
  assert.equal(calls.length, 0);
});

test("keeps no-content responses bodyless and returns structured network failures", async () => {
  const noContent = transport(new Response(null, { status: 204 }));
  const response = await handleBareRequest(request(), noContent.fetcher);
  assert.equal(response.headers.get("x-bare-status"), "204");
  assert.equal(await response.text(), "");
  const failed = transport(() => { throw new Error("upstream secret"); });
  const error = await handleBareRequest(request(), failed.fetcher);
  assert.equal(error.status, 502);
  assert.equal((await error.json()).code, "REMOTE_FETCH_FAILED");
});

test("preserves binary media ranges and seek validation headers without buffering", async () => {
  const bytes = new Uint8Array([0, 255, 17, 33, 129, 0]);
  let produced = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (produced === bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(produced, produced + 2));
      produced += 2;
    },
  });
  const { fetcher, calls } = transport(new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers: { "content-type": "video/mp4", "content-range": "bytes 42-47/1000000", "accept-ranges": "bytes", "content-length": "6", etag: '"movie-version"' },
  }));
  const response = await handleBareRequest(request("https://example.com/movie.mp4", { bareHeaders: { Range: "bytes=42-47", "If-Range": '"movie-version"', Referer: "https://example.com/player" } }), fetcher);
  assert.equal(calls[0].init.headers.get("range"), "bytes=42-47");
  assert.equal(calls[0].init.headers.get("if-range"), '"movie-version"');
  assert.equal(calls[0].init.headers.get("referer"), "https://example.com/player");
  assert.equal(response.headers.get("x-bare-status"), "206");
  const remote = metadata(response.headers);
  assert.equal(remote["content-type"], "video/mp4");
  assert.equal(remote["content-range"], "bytes 42-47/1000000");
  assert.equal(remote["accept-ranges"], "bytes");
  assert.equal(remote["content-length"], "6");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test("cancelling a media response cancels its upstream stream and fetch signal", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
    cancel() { cancelled = true; },
  });
  const { fetcher, calls } = transport(new Response(body, { headers: { "content-type": "video/mp4" } }));
  const response = await handleBareRequest(request("https://example.com/movie.mp4"), fetcher);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(cancelled, true);
  assert.equal(calls[0].init.signal.aborted, true);
});
