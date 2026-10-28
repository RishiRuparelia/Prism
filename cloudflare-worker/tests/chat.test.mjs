import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../drizzle/0000_tiresome_skrulls.sql", import.meta.url), "utf8"));
globalThis.__chatTestEnv = {
  DB: {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            async all() { return { results: statement.all(...values) }; },
            async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
          };
        },
      };
    },
  },
};
const source = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('import { env } from "cloudflare:workers";', "const env = globalThis.__chatTestEnv;");
const { GET, POST } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const send = (body) => POST(new Request("https://rooster.test/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

test("chat persists messages, isolates rooms, rejects malformed input, and applies atomic rate limiting", async () => {
  const empty = await GET(new Request("https://rooster.test/api/chat?room=lounge"));
  assert.deepEqual(await empty.json(), { messages: [] });
  assert.equal(empty.headers.get("cache-control"), "no-store");

  const payload = { room: "lounge", name: "Alex", text: "Hello <script>alert(1)</script>", clientId: "client-123456" };
  const sent = await send(payload);
  assert.equal(sent.status, 201);
  const { message } = await sent.json();
  assert.equal(message.text, payload.text);
  assert.equal(message.name, "Alex");
  assert.equal(typeof message.createdAt, "number");
  assert.equal("clientId" in message, false);

  const limited = await send({ ...payload, room: "games" });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "2");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count, 1);

  assert.equal((await send({ ...payload, clientId: "new-client-123", room: "../../private" })).status, 400);
  assert.equal((await send({ ...payload, clientId: "new-client-123", name: "x".repeat(25) })).status, 400);
  assert.equal((await send({ ...payload, clientId: "new-client-123", text: " " })).status, 400);
  assert.equal((await send({ ...payload, clientId: "new-client-123", text: "x".repeat(1001) })).status, 400);
  assert.equal((await send({ ...payload, clientId: "invalid" })).status, 400);
  assert.equal((await GET(new Request("https://rooster.test/api/chat?room=UPPERCASE"))).status, 400);
  assert.deepEqual(await (await GET(new Request("https://rooster.test/api/chat?room=games"))).json(), { messages: [] });

  sqlite.prepare("UPDATE chat_messages SET created_at = ? WHERE id = ?").run(Date.now() - 3000, message.id);
  assert.equal((await send({ ...payload, text: "Second message" })).status, 201);

  const insert = sqlite.prepare("INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?, ?)");
  for (let i = 0; i < 60; i++) insert.run(`seed-${i}`, "archive", "Reader", `Message ${i}`, `seed-client-${i}`, i);
  const archive = await (await GET(new Request("https://rooster.test/api/chat?room=archive"))).json();
  assert.equal(archive.messages.length, 50);
  assert.equal(archive.messages[0].text, "Message 10");
  assert.equal(archive.messages[49].text, "Message 59");
});
