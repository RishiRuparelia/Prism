/** Bare v3 transport for the browser's Ultraviolet service worker. */
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type BareHeaders = Record<string, string | string[]>;
type Socket = WebSocket & { accept(): void };

const HEADER_CHUNK = 3000;
const MAX_HEADERS = 64 * 1024;
const TIMEOUT_MS = 30_000;
const DNS_CACHE = new Map<string, number>();
const HOP_HEADERS = new Set([
  "connection", "content-length", "transfer-encoding", "keep-alive",
  "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade", "host",
]);
const NO_BODY_STATUS = new Set([101, 204, 205, 304]);

class ProxyError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function corsHeaders(request: Request): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": request.headers.get("access-control-request-headers") || "*",
    "access-control-expose-headers": "*",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
}

function failure(request: Request, error: unknown): Response {
  const known = error instanceof ProxyError;
  if (!known) console.error("[rooster-proxy] transport failure", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown transport error");
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({
    code: known ? error.code : "REMOTE_FETCH_FAILED",
    message: known ? error.message : "The destination could not be reached. Try another address or reload.",
  }), { status: known ? error.status : 502, headers });
}

/** URL parsing canonicalizes unusual IPv4 formats before this check. */
export function isPublicAddress(address: string): boolean {
  let host = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (host.includes(":")) {
    try { host = new URL(`http://[${host}]/`).hostname.slice(1, -1); }
    catch { return false; }
    // Only ordinary global-unicast IPv6; mapped, transition, multicast,
    // link-local, unique-local and documentation ranges are excluded.
    return /^[23][0-9a-f]{3}:/.test(host) &&
      !/^2001:(?:db8|0|0?2|0?1[0-9a-f]|0?2[0-9a-f])(?::|$)/.test(host) &&
      !/^2002:/.test(host);
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const octets = host.split(".").map(Number);
  if (octets.some((n) => n < 0 || n > 255)) return false;
  const [a, b, c] = octets;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function validateTarget(raw: string, site: URL, socket = false): URL {
  let target: URL;
  try { target = new URL(raw); }
  catch { throw new ProxyError(400, "INVALID_BARE_HEADER", "Enter a complete, valid destination URL."); }
  const protocols = socket ? ["ws:", "wss:"] : ["http:", "https:"];
  if (!protocols.includes(target.protocol) || target.username || target.password) {
    throw new ProxyError(400, "INVALID_TARGET", "Only public web addresses without embedded credentials are supported.");
  }
  if (target.port && target.port !== "80" && target.port !== "443") {
    throw new ProxyError(403, "TARGET_BLOCKED", "This destination port is unavailable.");
  }
  const host = target.hostname.toLowerCase().replace(/\.$/, "");
  const ownHost = site.hostname.toLowerCase().replace(/\.$/, "");
  const literal = host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (host === ownHost || (literal && !isPublicAddress(host)) ||
    (!literal && (!host.includes(".") || /(?:^|\.)(?:localhost|local|internal|lan|home|corp|test|invalid|example|arpa|onion)$/.test(host)))) {
    throw new ProxyError(403, "TARGET_BLOCKED", "Local, private, and recursive destinations are unavailable.");
  }
  target.hash = "";
  return target;
}

async function checkDns(target: URL, fetcher: Fetcher): Promise<void> {
  const host = target.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return;
  if (fetcher === globalThis.fetch && (DNS_CACHE.get(host) || 0) > Date.now()) return;
  const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
    const endpoint = new URL("https://cloudflare-dns.com/dns-query");
    endpoint.searchParams.set("name", host);
    endpoint.searchParams.set("type", type);
    const response = await fetcher(endpoint, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5_000),
      redirect: "manual",
    });
    if (!response.ok) throw new ProxyError(502, "DNS_FAILED", "The destination's address could not be verified.");
    const data = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0 && data.Status !== 3) {
      throw new ProxyError(502, "DNS_FAILED", "The destination's address could not be verified.");
    }
    return (data.Answer || []).filter((entry) => entry.type === 1 || entry.type === 28).map((entry) => entry.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length) throw new ProxyError(502, "DNS_FAILED", "This destination has no reachable public address.");
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw new ProxyError(403, "TARGET_BLOCKED", "The destination resolves to a private or reserved address.");
  }
  if (fetcher === globalThis.fetch) {
    if (DNS_CACHE.size >= 256) DNS_CACHE.delete(DNS_CACHE.keys().next().value!);
    DNS_CACHE.set(host, Date.now() + 30_000);
  }
}

function readSplitHeaders(headers: Headers): string {
  const single = headers.get("x-bare-headers");
  if (single !== null) {
    if (single.length > MAX_HEADERS) throw new ProxyError(431, "INVALID_BARE_HEADER", "Request headers are too large.");
    return single;
  }
  const parts: [number, string][] = [];
  headers.forEach((value, key) => {
    const match = /^x-bare-headers-(\d+)$/.exec(key);
    if (match) parts.push([Number(match[1]), value]);
  });
  parts.sort((a, b) => a[0] - b[0]);
  if (!parts.length) throw new ProxyError(400, "MISSING_BARE_HEADER", "Missing x-bare-headers.");
  let joined = "";
  for (let i = 0; i < parts.length; i++) {
    if (parts[i][0] !== i || !parts[i][1].startsWith(";")) {
      throw new ProxyError(400, "INVALID_BARE_HEADER", "Split request headers are malformed.");
    }
    joined += parts[i][1].slice(1);
    if (joined.length > MAX_HEADERS) throw new ProxyError(431, "INVALID_BARE_HEADER", "Request headers are too large.");
  }
  return joined;
}

function parseHeaders(raw: string): BareHeaders {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new ProxyError(400, "INVALID_BARE_HEADER", "Request headers must contain valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProxyError(400, "INVALID_BARE_HEADER", "Request headers must be an object.");
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) ||
      !(typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"))) ||
      (Array.isArray(value) ? value : [value]).some((v) => /[\r\n\0]/.test(v as string))) {
      throw new ProxyError(400, "INVALID_BARE_HEADER", "A request header name or value is invalid.");
    }
  }
  return parsed as BareHeaders;
}

function upstreamHeaders(values: BareHeaders, request: Request): Headers {
  const result = new Headers();
  const nominated = new Set(String(values.Connection || values.connection || "").toLowerCase().split(",").map((v) => v.trim()));
  for (const [key, value] of Object.entries(values)) {
    if (HOP_HEADERS.has(key.toLowerCase()) || nominated.has(key.toLowerCase())) continue;
    result.set(key, Array.isArray(value) ? value.join(key.toLowerCase() === "cookie" ? "; " : ", ") : value);
  }
  const forwarded = ["accept-language", ...(request.headers.get("x-bare-forward-headers") || "").split(",")];
  for (const name of forwarded) {
    const key = name.trim().replace(/^"|"$/g, "").toLowerCase();
    if (key && !HOP_HEADERS.has(key) && !["origin", "referer", "cookie", "authorization"].includes(key) && !key.startsWith("oai-authenticated-") && request.headers.has(key)) {
      result.set(key, request.headers.get(key)!);
    }
  }
  // Bare's response body remains streamable, without buffering movie/game files.
  result.set("accept-encoding", "identity");
  return result;
}

function remoteHeaders(response: Response): BareHeaders {
  const values: BareHeaders = {};
  response.headers.forEach((value, key) => { values[key] = value; });
  const headers = response.headers as Headers & { getSetCookie?(): string[]; getAll?(name: string): string[] };
  const cookies = headers.getSetCookie?.() ?? headers.getAll?.("set-cookie");
  if (cookies?.length) values["set-cookie"] = cookies;
  return values;
}

function writeSplitHeaders(headers: Headers, values: BareHeaders): void {
  const json = JSON.stringify(values);
  if (json.length <= HEADER_CHUNK) headers.set("x-bare-headers", json);
  else {
    for (let i = 0; i < json.length; i += HEADER_CHUNK) {
      headers.set(`x-bare-headers-${i / HEADER_CHUNK}`, ";" + json.slice(i, i + HEADER_CHUNK));
    }
  }
}

async function proxyHttp(request: Request, fetcher: Fetcher): Promise<Response> {
  const rawTarget = request.headers.get("x-bare-url");
  if (!rawTarget) throw new ProxyError(400, "MISSING_BARE_HEADER", "Missing x-bare-url.");
  const target = validateTarget(rawTarget, new URL(request.url));
  const values = parseHeaders(readSplitHeaders(request.headers));
  if (["CONNECT", "TRACE", "TRACK"].includes(request.method)) {
    throw new ProxyError(405, "METHOD_NOT_ALLOWED", "This request method is unavailable.");
  }
  await checkDns(target, fetcher);
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  let response: Response;
  try {
    response = await fetcher(target, {
      method: request.method,
      headers: upstreamHeaders(values, request),
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
      signal: controller.signal,
      // Node's local test runtime requires this for streamed upload bodies.
      ...(!["GET", "HEAD"].includes(request.method) ? { duplex: "half" } : {}),
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new ProxyError(504, "REMOTE_TIMEOUT", "The destination took too long to respond.");
    throw error;
  }
  clearTimeout(timer);
  const headers = corsHeaders(request);
  headers.set("x-bare-status", String(response.status));
  headers.set("x-bare-status-text", response.statusText);
  writeSplitHeaders(headers, remoteHeaders(response));
  const pass = new Set(["content-encoding", "last-modified", ...(request.headers.get("x-bare-pass-headers") || "").split(",").map((v) => v.trim().replace(/^"|"$/g, "").toLowerCase())]);
  const forbidden = /^(?:access-control-|x-bare-|set-cookie$|location$|content-length$|connection$|transfer-encoding$|vary$)/;
  for (const key of pass) {
    if (key && !forbidden.test(key) && response.headers.has(key)) headers.set(key, response.headers.get(key)!);
  }
  const passStatus = (request.headers.get("x-bare-pass-status") || "").split(",").map(Number);
  const status = passStatus.includes(response.status) ? response.status : 200;
  const noBody = request.method === "HEAD" || NO_BODY_STATUS.has(response.status) || NO_BODY_STATUS.has(status);
  let body: ReadableStream<Uint8Array> | null = null;
  if (!noBody && response.body) {
    const reader = response.body.getReader();
    // An idle timeout releases stalled streams while allowing long downloads.
    body = new ReadableStream({
      async pull(stream) {
        timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const chunk = await reader.read();
          clearTimeout(timer);
          if (chunk.done) stream.close();
          else stream.enqueue(chunk.value);
        } catch (error) { clearTimeout(timer); stream.error(error); }
      },
      cancel(reason) { clearTimeout(timer); controller.abort(); return reader.cancel(reason); },
    });
  }
  return new Response(body, { status, headers });
}

async function proxySocket(request: Request, fetcher: Fetcher): Promise<Response> {
  if (typeof WebSocketPair === "undefined") throw new ProxyError(501, "WEBSOCKET_UNAVAILABLE", "WebSocket transport requires the Cloudflare Worker runtime.");
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1] as Socket;
  server.accept();
  let remote: Socket | undefined;
  let connected = false;
  let handshaking = false;
  const close = () => {
    clearTimeout(timer);
    try { server.close(1000); } catch { /* Already closed. */ }
    try { remote?.close(1000); } catch { /* Already closed. */ }
  };
  const timer = setTimeout(close, 10_000);
  server.addEventListener("message", async (event) => {
    if (connected) { try { remote?.send(event.data); } catch { close(); } return; }
    if (handshaking || typeof event.data !== "string" || event.data.length > MAX_HEADERS) { close(); return; }
    handshaking = true;
    try {
      const data = JSON.parse(event.data) as { type: string; remote: string; protocols?: string[]; headers?: BareHeaders };
      if (data.type !== "connect" || typeof data.remote !== "string" ||
        (data.protocols && (!Array.isArray(data.protocols) || data.protocols.some((p) => typeof p !== "string")))) throw new Error("Invalid handshake");
      const target = validateTarget(data.remote, new URL(request.url), true);
      await checkDns(target, fetcher);
      const headers = upstreamHeaders(parseHeaders(JSON.stringify(data.headers || {})), request);
      headers.delete("sec-websocket-key");
      headers.delete("sec-websocket-version");
      headers.delete("sec-websocket-extensions");
      headers.set("upgrade", "websocket");
      if (data.protocols?.length) headers.set("sec-websocket-protocol", data.protocols.join(", "));
      target.protocol = target.protocol === "wss:" ? "https:" : "http:";
      const handshake = new AbortController();
      const handshakeTimer = setTimeout(() => handshake.abort(), 8_000);
      let response: Response;
      try {
        response = await fetcher(target, { headers, redirect: "manual", signal: handshake.signal });
      } finally { clearTimeout(handshakeTimer); }
      remote = (response as Response & { webSocket?: Socket }).webSocket;
      if (response.status !== 101 || !remote) throw new Error("Upgrade failed");
      remote.accept();
      remote.addEventListener("message", (message) => { try { server.send(message.data); } catch { close(); } });
      remote.addEventListener("close", close);
      remote.addEventListener("error", close);
      const cookies = remoteHeaders(response)["set-cookie"] || [];
      server.send(JSON.stringify({ type: "open", protocol: response.headers.get("sec-websocket-protocol") || "", setCookies: typeof cookies === "string" ? [cookies] : cookies }));
      connected = true;
      clearTimeout(timer);
    } catch (error) {
      console.error("[prism-proxy] WebSocket handshake failed", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown upgrade error");
      close();
    }
  });
  server.addEventListener("close", close);
  server.addEventListener("error", close);
  return new Response(null, { status: 101, webSocket: client } as ResponseInit);
}

export async function handleBareRequest(request: Request, fetcher: Fetcher = globalThis.fetch): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === "/bare" || url.pathname === "/bare/") {
      const headers = corsHeaders(request);
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ versions: ["v3"], language: "ServiceWorker", project: { name: "PRISM Bare Transport", version: "1.0.0" } }), { headers });
    }
    if (url.pathname !== "/bare/v3/") throw new ProxyError(404, "NOT_FOUND", "Unknown Bare transport endpoint.");
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") return await proxySocket(request, fetcher);
    return await proxyHttp(request, fetcher);
  } catch (error) { return failure(request, error); }
}
