import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/prism/chat.js", import.meta.url), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));
class Element {
  constructor() {
    this.value = ""; this.textContent = ""; this.children = []; this.events = {}; this.dataset = {};
    this.classList = { toggle() {} }; this.scrollHeight = 100; this.scrollTop = 0; this.clientHeight = 100;
    this.disabled = false;
  }
  addEventListener(name, callback) { this.events[name] = callback; }
  setAttribute() {}
  querySelectorAll(selector) { return selector === "[data-id]" ? this.children.filter(child => child.dataset.id) : []; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  focus() {}
}
function harness({ crypto = undefined } = {}) {
  const elements = new Map(), requests = [], timers = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const buttons = ["lounge", "gaming", "movie-night"].map(room => { const button = new Element(); button.dataset.room = room; return button; });
  const storage = new Map();
  let timerId = 0, poll;
  const context = {
    URL, URLSearchParams, Date, Error, Set, Map, JSON, Math, Uint8Array, AbortController,
    ...(crypto ? { crypto } : {}),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval(callback) { poll = callback; },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    location: { href: "http://localhost:8080/prism/chat.html", search: "" }, history: { replaceState() {} },
    window: { addEventListener() {} },
    document: { hidden: false, getElementById: element, createElement: () => new Element(), querySelectorAll: () => buttons, addEventListener() {} },
    fetch(url, options = {}) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  };
  vm.runInNewContext(source, context, { filename: "chat.js" });
  return {
    element, requests, timers, storage,
    poll: () => poll(),
    room: room => buttons.find(button => button.dataset.room === room).events.click(),
    submit(text = "Hello from the test") { element("message-input").value = text; return element("chat-compose").events.submit({ preventDefault() {} }); },
    messages: () => element("chat-messages").children.filter(child => child.dataset.id).map(child => child.dataset.id),
  };
}
function respond(request, data, status = 200) {
  request.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
}
const message = (id, text = id) => ({ id, name: "Explorer", text, createdAt: 1000 });

test("a successful send appears immediately and survives older or temporarily stale polls", async () => {
  const h = harness();
  const originalPoll = h.requests[0];
  const sending = h.submit("A delivered message");
  const post = h.requests.find(request => request.options.method === "POST");
  respond(post, { message: message("sent", "A delivered message") }, 201);
  await sending;
  assert.deepEqual(h.messages(), ["sent"]);
  assert.equal(h.element("message-input").value, "");
  assert.equal(originalPoll.options.signal.aborted, true);
  assert.equal(h.requests.filter(request => !request.options.method).length, 2);

  // Simulate a transport that completes an aborted request anyway.
  respond(originalPoll, { messages: [] });
  await flush();
  assert.deepEqual(h.messages(), ["sent"]);
  const newestPoll = h.requests.at(-1);
  respond(newestPoll, { messages: [] });
  await flush();
  assert.deepEqual(h.messages(), ["sent"]);
  assert.equal(h.element("connection-status").textContent, "CONNECTED");
});

test("switching rooms rejects old responses and old completion cannot unlock the current poll", async () => {
  const h = harness();
  const old = h.requests[0];
  h.room("gaming");
  const current = h.requests[1];
  assert.equal(old.options.signal.aborted, true);
  respond(old, { messages: [message("wrong-room")] });
  await flush();
  h.poll();
  assert.equal(h.requests.length, 2, "The active gaming request must retain its lock");
  respond(current, { messages: [message("gaming-message")] });
  await flush();
  assert.deepEqual(h.messages(), ["gaming-message"]);
});

test("an HTML sign-in response preserves the draft and successful reads cannot hide a failed send", async () => {
  const h = harness();
  respond(h.requests[0], { messages: [] }); await flush();
  const sending = h.submit("Keep this draft");
  const post = h.requests.at(-1);
  post.resolve(new Response("<!doctype html><title>Sign in</title>", { status: 401, headers: { "Content-Type": "text/html" } }));
  await sending;
  assert.equal(h.element("message-input").value, "Keep this draft");
  assert.equal(h.element("send-message").disabled, false);
  assert.equal(h.element("connection-status").textContent, "CANNOT SEND");
  assert.match(h.element("chat-status").textContent, /Sign in or reopen Prism/);
  h.poll(); respond(h.requests.at(-1), { messages: [] }); await flush();
  assert.equal(h.element("connection-status").textContent, "CANNOT SEND");
  assert.match(h.element("chat-status").textContent, /Sign in or reopen Prism/);
});

test("non-JSON gateway errors show a useful message instead of a JSON parser exception", async () => {
  const h = harness();
  h.requests[0].resolve(new Response("<html><h1>Bad gateway</h1></html>", { status: 502, headers: { "Content-Type": "text/html" } }));
  await flush();
  assert.equal(h.element("connection-status").textContent, "RECONNECTING");
  assert.match(h.element("chat-status").textContent, /page instead of message data/);
  assert.doesNotMatch(h.element("chat-status").textContent, /Unexpected token/);
});

test("poll timeouts work without AbortSignal.timeout and client IDs work without crypto.randomUUID", async () => {
  const h = harness();
  const timeout = [...h.timers.values()].find(timer => timer.delay === 12000);
  timeout.callback(); await flush();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.element("connection-status").textContent, "RECONNECTING");
  assert.match(h.element("chat-status").textContent, /timed out/);

  const sending = h.submit();
  const post = h.requests.at(-1), payload = JSON.parse(post.options.body);
  assert.match(payload.clientId, /^[a-zA-Z0-9_-]{8,80}$/);
  respond(post, { message: message("fallback-id") }, 201); await sending;
  assert.deepEqual(h.messages(), ["fallback-id"]);
});

test("a send finishing after a room switch preserves the new room and its draft", async () => {
  const h = harness();
  respond(h.requests[0], { messages: [] }); await flush();
  const sending = h.submit("Sent to lounge");
  const post = h.requests.at(-1);
  h.room("gaming");
  h.element("message-input").value = "New gaming draft";
  respond(post, { message: message("lounge-only") }, 201); await sending;
  assert.equal(h.element("message-input").value, "New gaming draft");
  assert.deepEqual(h.messages(), []);
  const gamingPoll = h.requests.at(-1);
  respond(gamingPoll, { messages: [message("gaming-only")] }); await flush();
  assert.deepEqual(h.messages(), ["gaming-only"]);
});
