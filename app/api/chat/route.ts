import { env } from "cloudflare:workers";

const roomPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const clientPattern = /^[a-zA-Z0-9_-]{8,80}$/;
const responseHeaders = { "Cache-Control": "no-store" };

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...responseHeaders, ...extraHeaders } });
}

export async function GET(request: Request) {
  const room = new URL(request.url).searchParams.get("room") || "lounge";
  if (!roomPattern.test(room)) {
    return json({ error: "Use a room name of 1–32 lowercase letters, numbers, dashes, or underscores." }, 400);
  }
  if (!env.DB) return json({ error: "Chat is starting up. Please try again shortly." }, 503);

  try {
    const result = await env.DB.prepare(
      `SELECT id, name, text, created_at AS createdAt
       FROM chat_messages WHERE room = ?
       ORDER BY created_at DESC, id DESC LIMIT 50`,
    ).bind(room).all();
    return json({ messages: result.results.reverse() });
  } catch (error) {
    console.error("Chat read failed", error);
    return json({ error: "Chat could not load. Please try again." }, 503);
  }
}

export async function POST(request: Request) {
  if (!env.DB) return json({ error: "Chat is starting up. Please try again shortly." }, 503);
  let input: Record<string, unknown>;
  try {
    const body = await request.text();
    if (body.length > 8192) return json({ error: "Message is too large." }, 413);
    input = JSON.parse(body);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid body");
  } catch {
    return json({ error: "Send a JSON object with room, name, text, and clientId." }, 400);
  }

  const room = typeof input.room === "string" ? input.room.trim() : "lounge";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const clientId = typeof input.clientId === "string" ? input.clientId : "";

  if (!roomPattern.test(room)) return json({ error: "Use a room name of 1–32 lowercase letters, numbers, dashes, or underscores." }, 400);
  if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)) {
    return json({ error: "Choose a display name between 1 and 24 characters." }, 400);
  }
  if (!text || text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return json({ error: "Messages must be between 1 and 1,000 characters." }, 400);
  }
  if (!clientPattern.test(clientId)) return json({ error: "Your chat session is invalid. Refresh the page and try again." }, 400);

  try {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    // A single conditional write makes the rate check atomic across Worker instances.
    const result = await env.DB.prepare(
      `INSERT INTO chat_messages (id, room, name, text, client_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM chat_messages WHERE client_id = ? AND created_at > ?
       )`,
    ).bind(id, room, name, text, clientId, createdAt, clientId, createdAt - 2000).run();
    if (!result.meta.changes) {
      return json({ error: "Wait two seconds between messages." }, 429, { "Retry-After": "2" });
    }
    return json({ message: { id, name, text, createdAt } }, 201);
  } catch (error) {
    console.error("Chat write failed", error);
    return json({ error: "Your message could not be sent. Please try again." }, 503);
  }
}
