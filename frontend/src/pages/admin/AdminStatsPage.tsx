import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { getAdminStats } from "../../api/admin";
import type { AdminStats } from "../../api/admin";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats().then(setStats).finally(() => setLoading(false));
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
