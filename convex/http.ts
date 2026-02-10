import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

const AGENT_SECRET = process.env.OC_AGENT_SECRET || "";
const TELEGRAM_BOT_TOKEN = process.env.OC_TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.OC_TELEGRAM_CHAT_ID || "1914009883";

function cors(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-OC-Token",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

function corsOptions() {
  return httpAction(async () => cors(null, 204));
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch { /* silent */ }
}

async function verifySiteToken(ctx: any, token: string) {
  const tokenHash = await hashToken(token);
  const site = await ctx.runQuery(api.sites.getByTokenHash, { tokenHash });
  if (!site || !site.active) return null;
  return { site, tokenHash };
}

// ============================================================
// AUTH
// ============================================================

http.route({
  path: "/api/auth/verify",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { token } = await req.json();
    if (!token) return cors({ authenticated: false }, 401);
    const result = await verifySiteToken(ctx, token);
    if (!result) return cors({ authenticated: false }, 401);
    return cors({
      authenticated: true,
      siteId: result.site.siteId,
      siteName: result.site.name,
      clientName: result.site.clientName,
    });
  }),
});
http.route({ path: "/api/auth/verify", method: "OPTIONS", handler: corsOptions() });

// ============================================================
// MESSAGES
// ============================================================

http.route({
  path: "/api/messages",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const token = req.headers.get("X-OC-Token") || url.searchParams.get("token") || "";
    if (!token) return cors({ error: "Unauthorized" }, 401);
    const result = await verifySiteToken(ctx, token);
    if (!result) return cors({ error: "Unauthorized" }, 401);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const messages = await ctx.runQuery(api.messages.list, { siteId: result.site.siteId, limit });
    return cors(messages);
  }),
});

http.route({
  path: "/api/messages",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = req.headers.get("X-OC-Token") || "";
    if (!token) return cors({ error: "Unauthorized" }, 401);
    const result = await verifySiteToken(ctx, token);
    if (!result) return cors({ error: "Unauthorized" }, 401);
    const { content } = await req.json();
    if (!content || typeof content !== "string" || content.trim().length === 0) return cors({ error: "Empty message" }, 400);
    if (content.length > 2000) return cors({ error: "Message too long" }, 400);
    const id = await ctx.runMutation(api.messages.send, {
      siteId: result.site.siteId, role: "client", content: content.trim(), status: "pending",
    });
    await sendTelegram(`🔔 <b>OrionChat</b> — ${result.site.name}\n\n<b>${result.site.clientName}:</b> ${content.trim().substring(0, 500)}\n\n<i>Site: ${result.site.domain}</i>`);
    return cors({ id, status: "pending" });
  }),
});
http.route({ path: "/api/messages", method: "OPTIONS", handler: corsOptions() });

// ============================================================
// TICKETS (client-facing)
// ============================================================

http.route({
  path: "/api/tickets",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = req.headers.get("X-OC-Token") || "";
    if (!token) return cors({ error: "Unauthorized" }, 401);
    const result = await verifySiteToken(ctx, token);
    if (!result) return cors({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const { title, description, type, priority, pageUrl, screenshot, metadata } = body;
    if (!title || !description || !type) return cors({ error: "Missing required fields" }, 400);
    const id = await ctx.runMutation(api.tickets.create, {
      siteId: result.site.siteId,
      title, description, type,
      priority: priority || "medium",
      pageUrl, screenshot, metadata,
      clientToken: result.tokenHash,
    });
    await sendTelegram(`🎫 <b>New Ticket</b> — ${result.site.name}\n\n<b>${title}</b>\nType: ${type}\n${description.substring(0, 300)}`);
    return cors({ id, status: "open" });
  }),
});

http.route({
  path: "/api/tickets",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const token = req.headers.get("X-OC-Token") || url.searchParams.get("token") || "";
    if (!token) return cors({ error: "Unauthorized" }, 401);
    const result = await verifySiteToken(ctx, token);
    if (!result) return cors({ error: "Unauthorized" }, 401);
    const status = url.searchParams.get("status") || undefined;
    const tickets = await ctx.runQuery(api.tickets.list, { siteId: result.site.siteId, status });
    return cors(tickets);
  }),
});

http.route({
  path: "/api/tickets",
  method: "PATCH",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const { id, status, priority, title, description, metadata } = await req.json();
    if (!id) return cors({ error: "Missing ticket id" }, 400);
    await ctx.runMutation(api.tickets.update, { id, status, priority, title, description, metadata });
    return cors({ ok: true });
  }),
});

http.route({ path: "/api/tickets", method: "OPTIONS", handler: corsOptions() });

// ============================================================
// AGENT ENDPOINTS
// ============================================================

http.route({
  path: "/api/agent/tickets",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const siteId = url.searchParams.get("siteId") || undefined;
    const tickets = await ctx.runQuery(api.tickets.list, { siteId, status });
    return cors(tickets);
  }),
});
http.route({ path: "/api/agent/tickets", method: "OPTIONS", handler: corsOptions() });

// All tickets (for kanban)
http.route({
  path: "/api/agent/tickets/all",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const tickets = await ctx.runQuery(api.tickets.listAll, {});
    return cors(tickets);
  }),
});
http.route({ path: "/api/agent/tickets/all", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/agent/reply",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const { siteId, content, messageId, status, metadata } = await req.json();
    if (messageId) {
      try { await ctx.runMutation(api.messages.updateStatus, { id: messageId, status: status || "done", metadata }); } catch { /* */ }
    }
    if (content) {
      await ctx.runMutation(api.messages.send, { siteId, role: "agent", content, status: "done", metadata });
    }
    return cors({ ok: true });
  }),
});
http.route({ path: "/api/agent/reply", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/agent/pending",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const url = new URL(req.url);
    const siteId = url.searchParams.get("siteId") || undefined;
    const pending = await ctx.runQuery(api.messages.getPending, { siteId });
    return cors(pending);
  }),
});

// ============================================================
// ADMIN
// ============================================================

http.route({
  path: "/api/admin/sites",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const { siteId, name, domain, repo, token, clientName, clientEmail } = await req.json();
    const tokenHash = await hashToken(token);
    const id = await ctx.runMutation(api.sites.create, { siteId, name, domain, repo, tokenHash, clientName, clientEmail });
    return cors({ id, siteId });
  }),
});
http.route({ path: "/api/admin/sites", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/admin/sites",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const sites = await ctx.runQuery(api.sites.list, {});
    return cors(sites);
  }),
});

export default http;
