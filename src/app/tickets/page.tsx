"use client";

import { useState, useEffect, useCallback } from "react";

const PASSWORD = "RafaMatt2026";
const COOKIE_NAME = "oc_tickets_auth";

interface Ticket {
  _id: string;
  siteId: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priority?: string;
  pageUrl?: string;
  screenshot?: string;
  metadata?: string;
  createdAt: number;
  updatedAt: number;
}

const COLUMNS = [
  { key: "open", label: "Open", color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
  { key: "in_progress", label: "In Progress", color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
  { key: "done", label: "Done", color: "#10b981", bg: "rgba(16,185,129,0.08)" },
  { key: "closed", label: "Closed", color: "#6b7280", bg: "rgba(107,114,128,0.08)" },
];

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  bug: { bg: "#dc2626", text: "#fff" },
  change_request: { bg: "#8b5cf6", text: "#fff" },
  feedback: { bg: "#06b6d4", text: "#fff" },
};

const PRIORITY_DOTS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function TicketsPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    if (document.cookie.includes(`${COOKIE_NAME}=1`)) setAuthed(true);
  }, []);

  const login = () => {
    if (password === PASSWORD) {
      document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      setAuthed(true);
    }
  };

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets");
      const data = await res.json();
      if (Array.isArray(data)) setTickets(data);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) {
      fetchTickets();
      const interval = setInterval(fetchTickets, 10000);
      return () => clearInterval(interval);
    }
  }, [authed, fetchTickets]);

  const updateStatus = async (id: string, status: string) => {
    setTickets((prev) => prev.map((t) => (t._id === id ? { ...t, status, updatedAt: Date.now() } : t)));
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  };

  const sites = [...new Set(tickets.map((t) => t.siteId))];
  const filtered = siteFilter === "all" ? tickets : tickets.filter((t) => t.siteId === siteFilter);

  if (!authed) {
    return (
      <div style={{
        minHeight: "100vh", background: "#080a0f",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16, padding: "48px 40px", width: 380,
          boxShadow: "0 0 80px rgba(59,130,246,0.05)",
        }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: "#3b82f6", textTransform: "uppercase", marginBottom: 8 }}>ORIÓN</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 32 }}>Ticket Board</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="Enter password"
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)", background: "#0d1117",
              color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box",
              fontFamily: "inherit",
            }}
            autoFocus
          />
          <button
            onClick={login}
            style={{
              width: "100%", marginTop: 16, padding: "12px",
              borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: 1,
            }}
          >
            AUTHENTICATE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#080a0f",
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      color: "#c9d1d9",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(13,17,23,0.8)", backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: "#3b82f6", textTransform: "uppercase" }}>ORIÓN</div>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            style={{
              padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)", background: "#0d1117",
              color: "#c9d1d9", fontSize: 12, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <option value="all">All sites</option>
            {sites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "#64748b", fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0, minHeight: "calc(100vh - 65px)",
        }}>
          {COLUMNS.map((col) => {
            const colTickets = filtered.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("ticketId");
                  if (id) updateStatus(id, col.key);
                }}
                style={{
                  borderRight: "1px solid rgba(255,255,255,0.03)",
                  background: dragOver === col.key ? col.bg : "transparent",
                  transition: "background 0.2s",
                  padding: "20px 16px",
                }}
              >
                {/* Column header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "0 4px",
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: col.color,
                    boxShadow: `0 0 8px ${col.color}40`,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#8b949e" }}>
                    {col.label}
                  </span>
                  <span style={{
                    fontSize: 11, color: "#484f58",
                    background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 10,
                  }}>
                    {colTickets.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {colTickets.map((ticket) => {
                    const typeStyle = TYPE_COLORS[ticket.type] || TYPE_COLORS.feedback;
                    const isExpanded = expanded === ticket._id;
                    return (
                      <div
                        key={ticket._id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("ticketId", ticket._id)}
                        onClick={() => setExpanded(isExpanded ? null : ticket._id)}
                        style={{
                          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
                          border: `1px solid ${isExpanded ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)"}`,
                          borderRadius: 12, padding: "14px 16px",
                          cursor: "grab", transition: "all 0.15s",
                          position: "relative", overflow: "hidden",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = isExpanded ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)")}
                      >
                        {/* Top row: type + priority */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                            padding: "2px 7px", borderRadius: 4,
                            background: typeStyle.bg, color: typeStyle.text,
                          }}>
                            {ticket.type.replace("_", " ")}
                          </span>
                          {ticket.priority && (
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: PRIORITY_DOTS[ticket.priority] || "#6b7280",
                            }} />
                          )}
                          <span style={{ marginLeft: "auto", fontSize: 10, color: "#484f58" }}>
                            {timeAgo(ticket.createdAt)}
                          </span>
                        </div>

                        {/* Title */}
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.4, marginBottom: 4 }}>
                          {ticket.title}
                        </div>

                        {/* Description snippet */}
                        <div style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.5 }}>
                          {isExpanded ? ticket.description : ticket.description.substring(0, 80) + (ticket.description.length > 80 ? "…" : "")}
                        </div>

                        {/* Site */}
                        <div style={{ fontSize: 10, color: "#484f58", marginTop: 8 }}>
                          {ticket.siteId}
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            {ticket.pageUrl && (
                              <div style={{ fontSize: 11, marginBottom: 8 }}>
                                <span style={{ color: "#484f58" }}>Page: </span>
                                <a href={ticket.pageUrl} target="_blank" rel="noopener" style={{ color: "#3b82f6", textDecoration: "none" }}>
                                  {ticket.pageUrl.length > 50 ? ticket.pageUrl.substring(0, 50) + "…" : ticket.pageUrl}
                                </a>
                              </div>
                            )}
                            {ticket.screenshot && (
                              <div style={{ marginBottom: 8 }}>
                                <img src={ticket.screenshot} alt="Screenshot" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }} />
                              </div>
                            )}
                            {ticket.priority && (
                              <div style={{ fontSize: 11, color: "#8b949e" }}>
                                Priority: <span style={{ color: PRIORITY_DOTS[ticket.priority] || "#6b7280", fontWeight: 600 }}>{ticket.priority}</span>
                              </div>
                            )}
                            {/* Status changer */}
                            <div style={{ marginTop: 10 }}>
                              <select
                                value={ticket.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => { e.stopPropagation(); updateStatus(ticket._id, e.target.value); }}
                                style={{
                                  padding: "4px 8px", borderRadius: 6,
                                  border: "1px solid rgba(255,255,255,0.08)", background: "#0d1117",
                                  color: "#c9d1d9", fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                                }}
                              >
                                {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded overlay */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        select:focus { outline: none; border-color: #3b82f6 !important; }
        input:focus { border-color: #3b82f6 !important; }
      `}</style>
    </div>
  );
}
