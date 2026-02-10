/**
 * OrionChat V2 — AI Chat + Ticket Widget
 * Embed: <script src="https://orion-chat-six.vercel.app/widget.js" defer></script>
 */
(function () {
  const APP_BASE = "https://orion-chat-six.vercel.app";
  const CONVEX_BASE = "https://hardy-mongoose-695.eu-west-1.convex.site";
  const TOKEN_KEY = "oc_token";
  const HISTORY_KEY = "oc_chat_history";

  // Check for token in URL params
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("oc_token");
  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);
    const url = new URL(window.location.href);
    url.searchParams.delete("oc_token");
    window.history.replaceState({}, "", url.toString());
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  let siteInfo = null;
  let isOpen = false;
  let activeTab = "chat";
  let chatHistory = [];
  let tickets = [];
  let isTyping = false;

  // Load chat history from localStorage
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) chatHistory = JSON.parse(saved);
  } catch { /* */ }

  function saveChatHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory.slice(-50))); } catch { /* */ }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatMessage(text) {
    // Bold
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function statusBadge(status) {
    const colors = {
      open: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
      in_progress: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
      done: { bg: "rgba(16,185,129,0.15)", text: "#10b981" },
      closed: { bg: "rgba(107,114,128,0.15)", text: "#6b7280" },
    };
    const c = colors[status] || colors.open;
    return `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${c.bg};color:${c.text};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${status.replace("_", " ")}</span>`;
  }

  function typeBadge(type) {
    const colors = { bug: "#dc2626", change_request: "#8b5cf6", feedback: "#06b6d4" };
    const c = colors[type] || "#6b7280";
    return `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:${c};color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${type.replace("_", " ")}</span>`;
  }

  // Verify token
  async function verify() {
    try {
      const res = await fetch(`${CONVEX_BASE}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.authenticated) {
        siteInfo = data;
        render();
        if (chatHistory.length === 0) {
          // Add initial AI greeting
          chatHistory.push({
            role: "assistant",
            content: `Hey ${data.clientName}! 👋 I'm Orián, your support assistant.\n\nI can help you report bugs, request changes, or share feedback about your site. Just tell me what you need and I'll create a ticket for you.\n\nWhat can I help you with?`,
            ts: Date.now(),
          });
          saveChatHistory();
        }
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch { /* */ }
  }

  async function sendChat(text) {
    chatHistory.push({ role: "user", content: text, ts: Date.now() });
    saveChatHistory();
    renderChat();
    scrollToBottom();

    isTyping = true;
    renderChat();

    try {
      const messages = chatHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${APP_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          siteId: siteInfo?.siteId,
          pageUrl: window.location.href,
          token,
        }),
      });

      const data = await res.json();
      isTyping = false;

      if (data.message) {
        chatHistory.push({ role: "assistant", content: data.message, ts: Date.now() });
        saveChatHistory();
        if (data.ticketCreated) loadTickets(); // Refresh tickets
      } else if (data.error) {
        chatHistory.push({ role: "assistant", content: "Sorry, I'm having trouble right now. Please try again in a moment.", ts: Date.now() });
        saveChatHistory();
      }
    } catch {
      isTyping = false;
      chatHistory.push({ role: "assistant", content: "Connection error. Please check your internet and try again.", ts: Date.now() });
      saveChatHistory();
    }

    renderChat();
    scrollToBottom();
  }

  async function loadTickets() {
    try {
      const res = await fetch(`${CONVEX_BASE}/api/tickets`, {
        headers: { "X-OC-Token": token },
      });
      const data = await res.json();
      if (Array.isArray(data)) tickets = data;
      if (activeTab === "tickets") renderTickets();
    } catch { /* */ }
  }

  function scrollToBottom() {
    const container = document.getElementById("oc-content");
    if (container) setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
  }

  function renderChat() {
    const container = document.getElementById("oc-content");
    if (!container || activeTab !== "chat") return;

    let html = "";
    chatHistory.forEach((m) => {
      const isUser = m.role === "user";
      html += `
        <div style="display:flex;flex-direction:column;align-items:${isUser ? "flex-end" : "flex-start"};margin-bottom:12px;">
          <div style="
            max-width:85%;padding:10px 14px;
            border-radius:${isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px"};
            background:${isUser ? "#3b82f6" : "#1e293b"};
            color:#fff;font-size:13px;line-height:1.6;word-break:break-word;
          ">${formatMessage(m.content)}</div>
          <div style="font-size:10px;color:#64748b;margin-top:3px;">${timeAgo(m.ts)}</div>
        </div>`;
    });

    if (isTyping) {
      html += `
        <div style="display:flex;align-items:flex-start;margin-bottom:12px;">
          <div style="padding:12px 18px;border-radius:16px 16px 16px 4px;background:#1e293b;">
            <div style="display:flex;gap:4px;align-items:center;">
              <div class="oc-dot" style="animation-delay:0s"></div>
              <div class="oc-dot" style="animation-delay:0.15s"></div>
              <div class="oc-dot" style="animation-delay:0.3s"></div>
            </div>
          </div>
        </div>`;
    }

    container.innerHTML = html;
  }

  function renderTickets() {
    const container = document.getElementById("oc-content");
    if (!container || activeTab !== "tickets") return;

    if (tickets.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#64748b;font-size:13px;">
        No tickets yet.<br>Chat with me to create one!
      </div>`;
      return;
    }

    container.innerHTML = tickets.map((t) => `
      <div style="background:#1e293b;border-radius:12px;padding:14px 16px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.04);">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          ${typeBadge(t.type)}
          ${statusBadge(t.status)}
          <span style="margin-left:auto;font-size:10px;color:#64748b;">${timeAgo(t.createdAt)}</span>
        </div>
        <div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:4px;">${escapeHtml(t.title)}</div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.5;">${escapeHtml(t.description).substring(0, 150)}</div>
        ${t.pageUrl ? `<div style="font-size:10px;color:#64748b;margin-top:6px;">📍 ${escapeHtml(t.pageUrl)}</div>` : ""}
      </div>
    `).join("");
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".oc-tab").forEach((el) => {
      el.style.color = el.dataset.tab === tab ? "#3b82f6" : "#64748b";
      el.style.borderBottom = el.dataset.tab === tab ? "2px solid #3b82f6" : "2px solid transparent";
    });
    if (tab === "chat") renderChat();
    else { loadTickets(); renderTickets(); }
    scrollToBottom();
  }

  function render() {
    // Inject styles
    const style = document.createElement("style");
    style.textContent = `
      @keyframes oc-bounce { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }
      .oc-dot { width:6px;height:6px;border-radius:50%;background:#64748b;animation:oc-bounce 1.4s infinite ease-in-out both; }
      .oc-tab { cursor:pointer;padding:10px 0;font-size:12px;font-weight:600;transition:all 0.2s;border-bottom:2px solid transparent; }
      .oc-tab:hover { color:#e2e8f0 !important; }
    `;
    document.head.appendChild(style);

    // Floating button
    const btn = document.createElement("div");
    btn.id = "oc-btn";
    btn.innerHTML = `
      <div style="
        position:fixed;bottom:24px;right:24px;z-index:99999;
        width:56px;height:56px;border-radius:50%;
        background:linear-gradient(135deg,#3b82f6,#8b5cf6);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;box-shadow:0 4px 20px rgba(59,130,246,0.4);
        transition:transform 0.2s,box-shadow 0.2s;
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
      </div>`;
    document.body.appendChild(btn);

    // Chat panel
    const panel = document.createElement("div");
    panel.id = "oc-panel";
    panel.style.cssText = `
      position:fixed;bottom:90px;right:24px;z-index:99999;
      width:390px;max-width:calc(100vw - 48px);height:540px;max-height:calc(100vh - 120px);
      background:#0f172a;border:1px solid rgba(255,255,255,0.08);
      border-radius:20px;overflow:hidden;display:none;
      box-shadow:0 20px 60px rgba(0,0,0,0.5);
      flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    `;
    panel.innerHTML = `
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:15px;font-weight:700;color:#fff;">Orián</div>
            <div style="font-size:11px;color:#64748b;">AI Support Assistant</div>
          </div>
          <div id="oc-close" style="cursor:pointer;color:#64748b;font-size:18px;padding:4px 8px;border-radius:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">✕</div>
        </div>
        <div style="display:flex;gap:24px;padding:0 20px;">
          <div class="oc-tab" data-tab="chat" style="color:#3b82f6;border-bottom:2px solid #3b82f6;">Chat</div>
          <div class="oc-tab" data-tab="tickets" style="color:#64748b;">My Tickets</div>
        </div>
      </div>
      <div id="oc-content" style="flex:1;overflow-y:auto;padding:16px;min-height:0;"></div>
      <div id="oc-input-area" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);background:#0f172a;">
        <div style="display:flex;gap:8px;">
          <input id="oc-input" type="text" placeholder="Describe your issue or request..." style="
            flex:1;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);
            background:#1e293b;color:#fff;font-size:13px;outline:none;transition:border-color 0.2s;
          " onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'" />
          <button id="oc-send" style="
            padding:10px 16px;border-radius:12px;border:none;
            background:#3b82f6;color:#fff;font-weight:600;font-size:13px;
            cursor:pointer;transition:background 0.2s;white-space:nowrap;
          " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">Send</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    // Events
    btn.addEventListener("click", () => {
      isOpen = !isOpen;
      panel.style.display = isOpen ? "flex" : "none";
      if (isOpen) {
        renderChat();
        scrollToBottom();
        document.getElementById("oc-input").focus();
        loadTickets();
      }
    });

    document.getElementById("oc-close").addEventListener("click", () => {
      isOpen = false;
      panel.style.display = "none";
    });

    document.querySelectorAll(".oc-tab").forEach((el) => {
      el.addEventListener("click", () => switchTab(el.dataset.tab));
    });

    const input = document.getElementById("oc-input");
    const sendBtn = document.getElementById("oc-send");
    const inputArea = document.getElementById("oc-input-area");

    function handleSend() {
      const text = input.value.trim();
      if (!text || isTyping) return;
      input.value = "";
      sendChat(text);
    }

    sendBtn.addEventListener("click", handleSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }

  verify();
})();
