import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import * as adminApi from "../../api/admin";
import type { AdminUser, AdminStats, Invite } from "../../api/admin";
import { apiFetch } from "../../api/client";
import { ConfirmModal } from "../../components/ConfirmModal";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ── User stats panel ───────────────────────────────────────────────────────────

interface UserStats {
  display_name: string;
  email: string;
  base_resumes: number;
  resume_variants: number;
  jobs_tracked: number;
  applications: number;
  ats_scores: number;
  skill_gaps: number;
  ai_tailor_runs_this_month: number;
  ai_tailor_runs_total: number;
  estimated_cost_usd: number;
}

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 text-sm">{label}</span>
      <div className="text-right">
        <span className="text-gray-900 text-sm font-medium">{value}</span>
        {sub && <p className="text-gray-400 text-xs">{sub}</p>}
      </div>
    </div>
  );
}

function UserStatsPanel({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<UserStats>(`/admin/users/${user.id}/stats`)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-gray-900 font-semibold text-base">{user.display_name}</h3>
            <p className="text-gray-400 text-sm">{user.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_disabled ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                {user.is_disabled ? "Disabled" : "Active"}
              </span>
              <span className="text-gray-300 text-xs">Joined {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl leading-none mt-0.5">×</button>
        </div>

        {/* Stats */}
        <div className="px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <div className="space-y-0">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Resumes</p>
              <StatRow label="Base resumes" value={stats.base_resumes} />
              <StatRow label="Tailored variants" value={stats.resume_variants} />

              <p className="text-gray-400 text-xs uppercase tracking-wide mt-4 mb-2">Job Search</p>
              <StatRow label="Jobs tracked" value={stats.jobs_tracked} />
              <StatRow label="Applications" value={stats.applications} />
              <StatRow label="ATS scores run" value={stats.ats_scores} />
              <StatRow label="Skill gaps tracked" value={stats.skill_gaps} />

              <p className="text-gray-400 text-xs uppercase tracking-wide mt-4 mb-2">AI Usage</p>
              <StatRow
                label="Tailor runs this month"
                value={stats.ai_tailor_runs_this_month}
              />
              <StatRow
                label="Tailor runs total"
                value={stats.ai_tailor_runs_total}
                sub={`≈ $${stats.estimated_cost_usd} estimated`}
              />
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">Failed to load stats</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Statistics tab ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function StatisticsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getAdminStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-24 animate-pulse shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return <p className="text-gray-400 text-sm">Failed to load statistics.</p>;

  return (
    <div className="space-y-6">
      {/* Top-line stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={stats.users.total}
          sub={`${stats.users.active} active · ${stats.users.disabled} disabled`}
        />
        <StatCard
          label="Resumes & Variants"
          value={`${stats.resumes.base_resumes} / ${stats.resumes.variants}`}
          sub="base resumes / tailored variants"
        />
        <StatCard
          label="AI Tailor Runs"
          value={stats.ai.tailor_runs_total}
          sub={`${stats.ai.tailor_runs_this_month} this month · $${stats.ai.estimated_cost_total_usd} total (estimated)`}
        />
        <StatCard
          label="Jobs Tracked"
          value={stats.jobs.total_tracked}
          sub={`${stats.jobs.applications} applications`}
        />
      </div>

      {/* Generated content breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-gray-700 text-sm font-semibold mb-4">Generated Content</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "ATS Scores", value: stats.content.ats_scores },
            { label: "Cover Letters", value: stats.content.cover_letters },
            { label: "Skill Gaps", value: stats.content.skill_gaps },
            { label: "New users this week", value: stats.users.new_this_week },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-indigo-600">{value}</p>
              <p className="text-gray-400 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* User growth */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-gray-700 text-sm font-semibold mb-1">User Growth</p>
          <p className="text-gray-400 text-xs mb-4">New registrations per week (last 8 weeks)</p>
          {stats.growth.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.growth} barSize={20}>
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} width={20} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="users" fill="#6366f1" radius={[3, 3, 0, 0]} name="New users" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Daily AI activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-gray-700 text-sm font-semibold mb-1">Daily AI Activity</p>
          <p className="text-gray-400 text-xs mb-4">Tailor runs + ATS scores per day (last 7 days)</p>
          {stats.daily_activity.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={stats.daily_activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} width={20} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Line type="monotone" dataKey="tailor_runs" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Tailor runs" />
                <Line type="monotone" dataKey="ats_scores" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="ATS scores" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Registration tab ───────────────────────────────────────────────────────────

function RegistrationTab() {
  const [permanentToken, setPermanentToken] = useState("");
  const [showPermanent, setShowPermanent] = useState(false);
  const [inviteHours, setInviteHours] = useState(24);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newInvite, setNewInvite] = useState<{ token: string; hours: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getRegistrationToken().then((r) => setPermanentToken(r.token));
    adminApi.listInvites().then(setInvites);
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const inv = await adminApi.createInvite(inviteHours);
      setNewInvite({ token: inv.token, hours: inv.expires_in_hours });
      const fresh = await adminApi.listInvites();
      setInvites(fresh);
    } finally { setGenerating(false); }
  }

  async function handleRevoke(token: string) {
    await adminApi.revokeInvite(token);
    setInvites((prev) => prev.filter((i) => i.token !== token));
    setRevokeConfirm(null);
  }

  function formatTtl(secs: number) {
    if (secs <= 0) return "Expired";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <ConfirmModal
        open={!!revokeConfirm} title="Revoke invite" danger
        message="This invite link will stop working immediately."
        confirmLabel="Revoke"
        onConfirm={() => void handleRevoke(revokeConfirm!)}
        onCancel={() => setRevokeConfirm(null)}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-gray-700 text-sm font-semibold mb-1">Permanent Registration Token</p>
        <p className="text-gray-400 text-xs mb-3">Set in your <code className="bg-gray-100 px-1 rounded">.env</code> — all users with this token can register.</p>
        <div className="flex items-center gap-2">
          <input type={showPermanent ? "text" : "password"} value={permanentToken} readOnly
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700" />
          <button onClick={() => setShowPermanent((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            {showPermanent ? "Hide" : "Show"}
          </button>
          <button onClick={async () => { await navigator.clipboard.writeText(permanentToken); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs text-indigo-600 hover:underline shrink-0">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-gray-700 text-sm font-semibold mb-1">Create Invite Token</p>
        <p className="text-gray-400 text-xs mb-3">Single-use token that expires after the specified time.</p>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <input type="number" value={inviteHours} onChange={(e) => setInviteHours(Number(e.target.value))}
              min={1} max={168}
              className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 text-center" />
            <span className="text-gray-500 text-sm">hours</span>
          </div>
          <button onClick={() => void handleGenerate()} disabled={generating}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-2 transition-colors">
            {generating ? "Generating…" : "Generate invite"}
          </button>
        </div>
        {newInvite && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <p className="text-indigo-700 text-xs font-medium mb-1.5">New invite — expires in {newInvite.hours}h (single use)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-indigo-800 break-all">{newInvite.token}</code>
              <button onClick={async () => { await navigator.clipboard.writeText(newInvite.token); }}
                className="text-xs text-indigo-600 hover:underline shrink-0">Copy</button>
            </div>
          </div>
        )}
      </div>

      {invites.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-gray-700 text-sm font-semibold mb-3">Active Invites ({invites.length})</p>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.token} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-gray-700">{inv.token_masked}</code>
                <span className="text-xs text-gray-400">{formatTtl(inv.remaining_seconds)} left</span>
                <button onClick={() => setRevokeConfirm(inv.token)}
                  className="text-xs text-red-500 hover:underline shrink-0">Revoke</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────────

function UsersTab() {
  const { user: adminUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [disableConfirm, setDisableConfirm] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);

  useEffect(() => {
    adminApi.listUsers().then(setUsers).finally(() => setLoading(false));
  }, []);

  async function handleDisable(u: AdminUser) {
    const updated = await adminApi.disableUser(u.id);
    setUsers((prev) => prev.map((x) => x.id === u.id ? updated : x));
    setDisableConfirm(null);
  }

  async function handleEnable(u: AdminUser) {
    const updated = await adminApi.enableUser(u.id);
    setUsers((prev) => prev.map((x) => x.id === u.id ? updated : x));
  }

  async function handleDelete(u: AdminUser) {
    await adminApi.deleteUser(u.id);
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    setDeleteConfirm(null);
    setSelectedUser(null);
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading users…</div>;

  return (
    <div>
      {selectedUser && (
        <UserStatsPanel user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
      <ConfirmModal
        open={!!disableConfirm} title="Disable account" danger
        message={`Disable ${disableConfirm?.display_name} (${disableConfirm?.email})? They will be logged out immediately.`}
        confirmLabel="Disable"
        onConfirm={() => void handleDisable(disableConfirm!)}
        onCancel={() => setDisableConfirm(null)}
      />
      <ConfirmModal
        open={!!deleteConfirm} title="Delete account" danger
        message={`Permanently delete ${deleteConfirm?.display_name} (${deleteConfirm?.email}) and all their data?`}
        confirmLabel="Delete permanently"
        onConfirm={() => void handleDelete(deleteConfirm!)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left w-28">Joined</th>
              <th className="px-4 py-3 text-left w-24">Status</th>
              <th className="px-4 py-3 text-right w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {users.map((u) => {
              const isSelf = u.id === adminUser?.id;
              return (
                <tr key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="text-gray-900 font-medium">{u.display_name}</p>
                    <p className="text-gray-400 text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_disabled ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                      {u.is_disabled ? "Disabled" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {isSelf ? (
                      <span className="text-gray-300 text-xs">You</span>
                    ) : (
                      <div className="flex gap-3 justify-end">
                        {u.is_disabled ? (
                          <button onClick={() => void handleEnable(u)}
                            className="text-xs text-green-600 hover:underline">Enable</button>
                        ) : (
                          <button onClick={() => setDisableConfirm(u)}
                            className="text-xs text-gray-500 hover:text-orange-600 transition-colors">Disable</button>
                        )}
                        <button onClick={() => setDeleteConfirm(u)}
                          className="text-xs text-gray-400 hover:text-red-600 transition-colors">Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-gray-400 text-xs px-4 py-2 border-t border-gray-100">Click a row to view account details</p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Tab = "statistics" | "users" | "registration";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("statistics");

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-400 text-sm">Platform overview, user management, and registration access.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([["statistics", "Statistics"], ["users", "Users"], ["registration", "Registration"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-900"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "statistics" && <StatisticsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "registration" && <RegistrationTab />}
    </div>
  );
}
