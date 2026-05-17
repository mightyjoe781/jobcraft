import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { getAdminStats, getAiUsageStats } from "../../api/admin";
import type { AdminStats, AiUsageStats } from "../../api/admin";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : String(n);
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminStats(), getAiUsageStats()])
      .then(([s, ai]) => { setStats(s); setAiUsage(ai); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
        <p className="text-gray-400 text-sm">Platform-wide usage and growth metrics.</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 h-24 animate-pulse shadow-sm" />
            ))}
          </div>
        </div>
      ) : !stats ? (
        <p className="text-gray-400 text-sm">Failed to load statistics.</p>
      ) : (
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
              label="AI Calls This Month"
              value={aiUsage ? fmt(aiUsage.this_month.calls) : stats.ai.tailor_runs_this_month}
              sub={
                aiUsage
                  ? `$${aiUsage.this_month.cost_usd.toFixed(4)} · ${pct(aiUsage.this_month.cache_hit_rate)} cache hits`
                  : `${stats.ai.tailor_runs_this_month} tailor runs`
              }
            />
            <StatCard
              label="Jobs Tracked"
              value={stats.jobs.total_tracked}
              sub={`${stats.jobs.applications} applications`}
            />
          </div>

          {/* Generated content */}
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

          {/* AI Token Usage */}
          {aiUsage && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-gray-700 text-sm font-semibold mb-1">AI Token Usage — This Month</p>
                <p className="text-gray-400 text-xs mb-4">Real costs from api responses (not estimates)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900">${aiUsage.this_month.cost_usd.toFixed(4)}</p>
                    <p className="text-gray-400 text-xs mt-1">Total cost</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-indigo-600">{pct(aiUsage.this_month.cache_hit_rate)}</p>
                    <p className="text-gray-400 text-xs mt-1">Cache hit rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900">{fmt(aiUsage.this_month.input_tokens)}</p>
                    <p className="text-gray-400 text-xs mt-1">Input tokens</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900">{fmt(aiUsage.this_month.output_tokens)}</p>
                    <p className="text-gray-400 text-xs mt-1">Output tokens</p>
                  </div>
                </div>

                {/* Per-feature breakdown */}
                {aiUsage.per_feature.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-xs font-medium mb-2 uppercase tracking-wide">Per-feature breakdown</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="py-2 pr-4 text-gray-400 font-medium">Feature</th>
                            <th className="py-2 pr-4 text-gray-400 font-medium text-right">Calls</th>
                            <th className="py-2 pr-4 text-gray-400 font-medium text-right">Cost</th>
                            <th className="py-2 pr-4 text-gray-400 font-medium text-right">Input tok</th>
                            <th className="py-2 text-gray-400 font-medium text-right">Cache hit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiUsage.per_feature.map((f) => (
                            <tr key={f.feature} className="border-b border-gray-50">
                              <td className="py-2 pr-4 font-medium text-gray-800 capitalize">{f.feature.replace("_", " ")}</td>
                              <td className="py-2 pr-4 text-gray-600 text-right">{f.calls}</td>
                              <td className="py-2 pr-4 text-gray-600 text-right">${f.cost_usd.toFixed(4)}</td>
                              <td className="py-2 pr-4 text-gray-600 text-right">{fmt(f.input_tokens)}</td>
                              <td className="py-2 text-right">
                                <span className={`font-medium ${f.cache_hit_rate > 0.3 ? "text-green-600" : "text-gray-500"}`}>
                                  {pct(f.cache_hit_rate)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Daily cost trend */}
              {aiUsage.daily_trend.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-gray-700 text-sm font-semibold mb-1">Daily AI Cost (last 30 days)</p>
                  <p className="text-gray-400 text-xs mb-4">Real cost in USD · shaded area = cache hits</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={aiUsage.daily_trend} barSize={12}>
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} width={40} tickFormatter={(v) => `$${v.toFixed(3)}`} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        formatter={(v) => [`$${Number(v).toFixed(4)}`, "cost"]}
                      />
                      <Bar dataKey="cost_usd" fill="#6366f1" radius={[3, 3, 0, 0]} name="Cost (USD)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top users */}
              {aiUsage.top_users.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-gray-700 text-sm font-semibold mb-4">Top Users by Cost — This Month</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="py-2 pr-4 text-gray-400 font-medium">User</th>
                          <th className="py-2 pr-4 text-gray-400 font-medium text-right">Calls</th>
                          <th className="py-2 text-gray-400 font-medium text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiUsage.top_users.map((u) => (
                          <tr key={u.user_id} className="border-b border-gray-50">
                            <td className="py-2 pr-4">
                              <p className="font-medium text-gray-800">{u.display_name}</p>
                              <p className="text-gray-400">{u.email}</p>
                            </td>
                            <td className="py-2 pr-4 text-gray-600 text-right">{u.calls}</td>
                            <td className="py-2 text-right font-medium text-gray-800">${u.cost_usd.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      )}
    </div>
  );
}
