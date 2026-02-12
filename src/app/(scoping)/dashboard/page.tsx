"use client";

import { useState, useEffect } from "react";

interface Session {
  _id: string;
  sessionId: string;
  status: string;
  briefData?: string;
  email?: string;
  deployUrl?: string;
  repoUrl?: string;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
}

const statusConfig: Record<string, { label: string; color: string; emoji: string }> = {
  submitted: { label: "Submitted", color: "bg-yellow-500/20 text-yellow-400", emoji: "📨" },
  approved: { label: "Approved", color: "bg-emerald-500/20 text-emerald-400", emoji: "✅" },
  rejected: { label: "Rejected", color: "bg-red-500/20 text-red-400", emoji: "❌" },
  building: { label: "Building", color: "bg-blue-500/20 text-blue-400", emoji: "🔨" },
  review: { label: "In Review", color: "bg-purple-500/20 text-purple-400", emoji: "👀" },
  live: { label: "Live!", color: "bg-emerald-500/20 text-emerald-400", emoji: "🚀" },
};

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("oc_scope_email");
    if (saved) {
      setEmail(saved);
      setAuthenticated(true);
      fetchSessions(saved);
    }
  }, []);

  async function fetchSessions(e: string) {
    setLoading(true);
    try {
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://hardy-mongoose-695.eu-west-1.convex.site";
      const res = await fetch(`${convexUrl}/api/scope/dashboard?email=${encodeURIComponent(e)}`);
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch { /* */ }
    setLoading(false);
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    localStorage.setItem("oc_scope_email", email.trim());
    setAuthenticated(true);
    fetchSessions(email.trim());
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <form onSubmit={handleLogin} className="w-full max-w-sm px-6">
          <h1 className="text-2xl font-bold mb-6 text-center">
            <span className="text-emerald-500">●</span> Project Dashboard
          </h1>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 mb-4"
            required
          />
          <button
            type="submit"
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-lg font-medium transition-colors"
          >
            View My Projects
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">
              <span className="text-emerald-500">●</span> Orián
            </span>
            <span className="text-gray-500 text-sm">/ Dashboard</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>{email}</span>
            <button
              onClick={() => { setAuthenticated(false); localStorage.removeItem("oc_scope_email"); }}
              className="text-gray-500 hover:text-gray-300"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Your Projects</h1>

        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-gray-400 mb-4">No projects yet</p>
            <a href="/" className="text-emerald-400 hover:text-emerald-300">
              Start a new project →
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((s) => {
              const config = statusConfig[s.status] || { label: s.status, color: "bg-gray-500/20 text-gray-400", emoji: "📄" };
              let projectName = "Untitled Project";
              try {
                if (s.briefData) {
                  const brief = JSON.parse(s.briefData);
                  projectName = brief.project_name || projectName;
                }
              } catch { /* */ }

              return (
                <div key={s._id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h2 className="text-lg font-semibold">{config.emoji} {projectName}</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm mb-4">
                    Submitted {new Date(s.createdAt).toLocaleDateString()}
                  </p>

                  {s.status === "live" && s.deployUrl && (
                    <a
                      href={s.deployUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors text-sm"
                    >
                      🌐 View Live Site → {s.deployUrl}
                    </a>
                  )}

                  {s.status === "rejected" && s.rejectionReason && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm">
                      <p className="text-red-400 font-medium mb-1">Reason:</p>
                      <p className="text-gray-300">{s.rejectionReason}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
