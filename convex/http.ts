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

function sanitizeInput(text: string, maxLen = 2000): string {
  // Strip HTML tags
  let clean = text.replace(/<[^>]*>/g, "");
  // Block script/event handler patterns
  clean = clean.replace(/on\w+\s*=/gi, "");
  // Block path traversal
  clean = clean.replace(/\.\.\//g, "");
  // Truncate
  return clean.substring(0, maxLen);
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

async function sendTelegram(text: string, reply_markup?: any) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const body: any = { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" };
    if (reply_markup) body.reply_markup = reply_markup;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { /* silent */ }
}

const RESEND_API_KEY = "re_HtofsyPF_PpotNkGX4uinBo9pffqaoe7w";

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Orián <noreply@orian.dev>",
        to: [to],
        subject,
        html,
      }),
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
      systemPrompt: result.site.systemPrompt || null,
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
    const sanitized = sanitizeInput(content.trim());
    const id = await ctx.runMutation(api.messages.send, {
      siteId: result.site.siteId, role: "client", content: sanitized, status: "pending",
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
    // Rate limit ticket creation: 10/hour per token
    // (Simple approach — tracked per request, real impl would use DB)
    const sanitizedTitle = sanitizeInput(title, 200);
    const sanitizedDesc = sanitizeInput(description, 2000);
    const sanitizedPageUrl = pageUrl ? sanitizeInput(pageUrl, 500) : undefined;
    const id = await ctx.runMutation(api.tickets.create, {
      siteId: result.site.siteId,
      title: sanitizedTitle, description: sanitizedDesc, type,
      priority: priority || "medium",
      pageUrl: sanitizedPageUrl, screenshot, metadata,
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
http.route({
  path: "/api/admin/sites",
  method: "PATCH",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const { siteId, ...fields } = body;
    if (!siteId) return cors({ error: "Missing siteId" }, 400);
    // Sanitize systemPrompt
    if (fields.systemPrompt && typeof fields.systemPrompt === "string") {
      fields.systemPrompt = fields.systemPrompt.substring(0, 5000);
    }
    await ctx.runMutation(api.sites.update, { siteId, ...fields });
    return cors({ ok: true });
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

// ============================================================
// SCOPING — Session & Brief endpoints
// ============================================================

http.route({
  path: "/api/scope/session",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    if (!sessionId) return cors({ error: "Missing sessionId" }, 400);
    const session = await ctx.runQuery(api.scopingSessions.getBySessionId, { sessionId });
    if (!session) return cors({ session: null, messages: [] });
    const messages = await ctx.runQuery(api.scopingMessages.list, { sessionId });
    return cors({ session, messages });
  }),
});
http.route({ path: "/api/scope/session", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/scope/message",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { sessionId, role, content } = await req.json();
    if (!sessionId || !role || !content) return cors({ error: "Missing fields" }, 400);

    // Ensure session exists
    const session = await ctx.runQuery(api.scopingSessions.getBySessionId, { sessionId });
    if (!session) {
      await ctx.runMutation(api.scopingSessions.create, { sessionId });
    }

    await ctx.runMutation(api.scopingMessages.send, { sessionId, role, content });
    return cors({ ok: true });
  }),
});
http.route({ path: "/api/scope/message", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/scope/brief",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { sessionId, briefData, status } = await req.json();
    if (!sessionId || !briefData) return cors({ error: "Missing fields" }, 400);

    // Ensure session exists
    const session = await ctx.runQuery(api.scopingSessions.getBySessionId, { sessionId });
    if (!session) {
      await ctx.runMutation(api.scopingSessions.create, { sessionId });
    }

    await ctx.runMutation(api.scopingSessions.updateBrief, { sessionId, briefData, status });
    return cors({ ok: true });
  }),
});
http.route({ path: "/api/scope/brief", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/scope/submit",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { sessionId, email } = await req.json();
    if (!sessionId || !email) return cors({ error: "Missing fields" }, 400);

    // Get session
    const session = await ctx.runQuery(api.scopingSessions.getBySessionId, { sessionId });
    if (!session) return cors({ error: "Session not found" }, 404);

    // Create/update user
    const userId = await ctx.runMutation(api.scopingUsers.createOrUpdate, { email });

    // Submit session
    await ctx.runMutation(api.scopingSessions.submit, { sessionId, email, userId: String(userId) });

    // Send Telegram notification
    let briefSummary = "No brief data";
    try {
      if (session.briefData) {
        const brief = JSON.parse(session.briefData);
        briefSummary = `📋 <b>${brief.project_name || "Untitled"}</b>\nType: ${brief.project_type || "N/A"}\n${(brief.description || "").substring(0, 300)}`;
      }
    } catch { /* */ }
    await sendTelegram(
      `🚀 <b>New Project Brief Submitted</b>\n\nFrom: ${email}\nSession: <code>${sessionId}</code>\n\n${briefSummary}`,
      {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve:${sessionId}` },
            { text: "❌ Reject", callback_data: `reject:${sessionId}` },
          ],
        ],
      }
    );

    return cors({ ok: true });
  }),
});
http.route({ path: "/api/scope/submit", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/scope/auth/send-magic-link",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { email } = await req.json();
    if (!email) return cors({ error: "Missing email" }, 400);

    // Generate token
    const token = crypto.randomUUID();
    const expiry = Date.now() + 15 * 60 * 1000; // 15 min

    await ctx.runMutation(api.scopingUsers.createOrUpdate, {
      email,
      magicLinkToken: token,
      magicLinkExpiry: expiry,
    });

    // In production, send email via Resend. For now return token for dev.
    // The Next.js API route handles actual email sending.
    return cors({ ok: true, token }); // token returned for dev; remove in prod
  }),
});
http.route({ path: "/api/scope/auth/send-magic-link", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/scope/auth/verify",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { token } = await req.json();
    if (!token) return cors({ error: "Missing token" }, 400);

    const user = await ctx.runQuery(api.scopingUsers.getByMagicLinkToken, { token });
    if (!user) return cors({ error: "Invalid token" }, 401);
    if (user.magicLinkExpiry && Date.now() > user.magicLinkExpiry) {
      return cors({ error: "Token expired" }, 401);
    }

    await ctx.runMutation(api.scopingUsers.clearMagicLink, { email: user.email });

    return cors({ ok: true, email: user.email, userId: String(user._id) });
  }),
});
http.route({ path: "/api/scope/auth/verify", method: "OPTIONS", handler: corsOptions() });

// ============================================================
// SCOPING — Approval / Rejection / Delivery
// ============================================================

http.route({
  path: "/api/scope/approve",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);

    const { sessionId, action, reason } = await req.json();
    if (!sessionId || !action) return cors({ error: "Missing sessionId or action" }, 400);

    const session = await ctx.runQuery(api.scopingSessions.getBySessionId, { sessionId });
    if (!session) return cors({ error: "Session not found" }, 404);

    if (action === "approve") {
      // Create ticket
      let briefTitle = "Untitled Project";
      let briefDesc = "No brief data";
      try {
        if (session.briefData) {
          const brief = JSON.parse(session.briefData);
          briefTitle = brief.project_name || "Untitled Project";
          briefDesc = JSON.stringify(brief, null, 2);
        }
      } catch { /* */ }

      const ticketId = await ctx.runMutation(api.tickets.create, {
        siteId: "orion-scoping",
        title: briefTitle,
        description: briefDesc,
        type: "project",
        priority: "high",
        clientToken: "scoping-system",
      });

      await ctx.runMutation(api.scopingSessions.approve, { sessionId, ticketId });
      await sendTelegram(`✅ <b>Brief Approved</b>\n\n${briefTitle}\nTicket created.`);

      if (session.email) {
        await sendEmail(
          session.email,
          "Your project has been approved! 🎉",
          `<h2>Great news!</h2><p>Your project <strong>${briefTitle}</strong> has been approved. We'll start working on it soon and keep you updated.</p><p>— The Orián Team</p>`
        );
      }

      return cors({ ok: true, ticketId: String(ticketId) });
    } else if (action === "reject") {
      await ctx.runMutation(api.scopingSessions.reject, { sessionId, reason });
      await sendTelegram(`❌ <b>Brief Rejected</b>\n\nSession: ${sessionId}\nReason: ${reason || "No reason given"}`);

      if (session.email) {
        await sendEmail(
          session.email,
          "Update on your project brief",
          `<h2>Project Brief Update</h2><p>After reviewing your brief, we've decided not to proceed at this time.</p>${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}<p>Feel free to submit a new brief anytime.</p><p>— The Orián Team</p>`
        );
      }

      return cors({ ok: true });
    }

    return cors({ error: "Invalid action" }, 400);
  }),
});
http.route({ path: "/api/scope/approve", method: "OPTIONS", handler: corsOptions() });

http.route({
  path: "/api/scope/deliver",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") || "";
    if (!AGENT_SECRET || authHeader !== `Bearer ${AGENT_SECRET}`) return cors({ error: "Unauthorized" }, 401);

    const { sessionId, repoUrl, deployUrl } = await req.json();
    if (!sessionId || !repoUrl || !deployUrl) return cors({ error: "Missing required fields" }, 400);

    const session = await ctx.runQuery(api.scopingSessions.getBySessionId, { sessionId });
    if (!session) return cors({ error: "Session not found" }, 404);

    // Auto-provision chat widget site
    const widgetSiteId = `scope-${sessionId.substring(0, 8)}`;
    const widgetToken = crypto.randomUUID();
    const tokenHash = await hashToken(widgetToken);

    let projectName = "Delivered Project";
    try {
      if (session.briefData) {
        const brief = JSON.parse(session.briefData);
        projectName = brief.project_name || projectName;
      }
    } catch { /* */ }

    await ctx.runMutation(api.sites.create, {
      siteId: widgetSiteId,
      name: projectName,
      domain: new URL(deployUrl).hostname,
      repo: repoUrl,
      tokenHash,
      clientName: session.email || "Client",
      clientEmail: session.email,
    });

    await ctx.runMutation(api.scopingSessions.deliver, {
      sessionId,
      repoUrl,
      deployUrl,
      widgetSiteId,
    });

    await sendTelegram(`🚀 <b>Project Delivered!</b>\n\n<b>${projectName}</b>\nDeploy: ${deployUrl}\nRepo: ${repoUrl}\n\n<b>Widget Setup:</b>\nSite ID: <code>${widgetSiteId}</code>\nToken: <code>${widgetToken}</code>\n\nEmbed:\n<code>&lt;script src="https://orion-chat-six.vercel.app/widget.js" data-site-id="${widgetSiteId}" data-token="${widgetToken}" data-accent="#10b981"&gt;&lt;/script&gt;</code>`);

    if (session.email) {
      await sendEmail(
        session.email,
        "Your project is live! 🚀",
        `<h2>Your project is live!</h2>
        <p><strong>${projectName}</strong> has been deployed and is ready for you.</p>
        <p><a href="${deployUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:white;text-decoration:none;border-radius:8px;">View Your Project</a></p>
        <p>We've embedded a chat widget on your site for easy feedback and support. Just click the chat icon in the bottom-right corner.</p>
        <p>— The Orián Team</p>`
      );
    }

    return cors({ ok: true, widgetSiteId, widgetToken });
  }),
});
http.route({ path: "/api/scope/deliver", method: "OPTIONS", handler: corsOptions() });

// Scoping dashboard — get sessions by email
http.route({
  path: "/api/scope/dashboard",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const email = url.searchParams.get("email") || "";
    const userId = url.searchParams.get("userId") || "";
    if (!email && !userId) return cors({ error: "Missing email or userId" }, 400);

    let sessions;
    if (userId) {
      sessions = await ctx.runQuery(api.scopingSessions.getByUserId, { userId });
    } else {
      // Fall back to filtering by status and checking email
      const all = await ctx.runQuery(api.scopingSessions.getByStatus, { status: "submitted" });
      sessions = all.filter((s: any) => s.email === email);
      // Also get other statuses
      for (const st of ["approved", "rejected", "building", "review", "live"]) {
        const more = await ctx.runQuery(api.scopingSessions.getByStatus, { status: st });
        sessions.push(...more.filter((s: any) => s.email === email));
      }
    }

    return cors(sessions);
  }),
});
http.route({ path: "/api/scope/dashboard", method: "OPTIONS", handler: corsOptions() });

export default http;
